import boto3
import sqlite3
import json
import time
import os
from PIL import Image
import numpy as np
from dotenv import load_dotenv
import tempfile
import requests
from inference_module import run_inference


# ==============================================================================
# --- LOAD ENVIRONMENT VARIABLES & CONFIGURATION ---
# ==============================================================================
load_dotenv()

SQS_QUEUE_URL = os.getenv('SQS_QUEUE_URL', '')
DATABASE_FILE = 'flight_data.db'  # Renamed to match the target database
AWS_REGION = os.getenv('AWS_DEFAULT_REGION')

POLL_WAIT_TIME = 20
LOOP_SLEEP_TIME = 5

# --- AWS Client Initialization ---
# Initialize S3 client for downloading the image (required for trash calculation)
# We assume the bucket name is consistent: 'bis-dal-aerial'
s3 = boto3.client('s3', region_name=AWS_REGION)


# ==============================================================================
# --- DATABASE FUNCTIONS ---
# ==============================================================================

def init_db():
    """Initializes the SQLite database and creates the flights and waypoints tables."""
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()

    # 1. Create flights table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flights (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL
        )
    ''')

    # 2. Create waypoints table
    # NOTE: Using s3_key as the waypoint ID for uniqueness here, as it's the primary
    # unique identifier for this incoming data point.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS waypoints (
            id TEXT PRIMARY KEY,
            flight_id TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            trashScore INTEGER NOT NULL,
            imageUrl TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (flight_id) REFERENCES flights (id)
        )
    ''')
    conn.commit()
    conn.close()
    print(f"Database '{DATABASE_FILE}' initialized successfully with 'flights' and 'waypoints' tables.")


def insert_flight_data(s3_key, s3_location, capture_timestamp, lat, lng, trash_score):
    """
    Inserts a new waypoint and ensures the parent flight record exists.

    For this scenario, we use the date part of the timestamp to define the 'flight_id'.
    """
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()

    # Extract date for flight ID and Waypoint time
    flight_date = capture_timestamp.split('T')[0]  # e.g., '2025-10-11'
    flight_id = f"flight-{flight_date}"
    waypoint_time = capture_timestamp.split('T')[1].split('.')[0]  # e.g., '15:50:57'
    waypoint_id = s3_key  # Using the unique S3 key as the Waypoint ID

    try:
        # 1. Insert/Ignore into the flights table
        # We assume one flight per day for simplicity based on the date field
        cursor.execute(
            "INSERT OR IGNORE INTO flights (id, date) VALUES (?, ?)",
            (flight_id, flight_date)
        )

        # 2. Insert into the waypoints table
        cursor.execute(
            """INSERT INTO waypoints (id, flight_id, lat, lng, trashScore, imageUrl, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (waypoint_id, flight_id, lat, lng, trash_score, s3_location, waypoint_time)
        )

        conn.commit()
        return True

    except sqlite3.IntegrityError as e:
        print(f"WARNING: Waypoint {waypoint_id} already exists (IntegrityError). Skipping.")
        return False
    except Exception as e:
        print(f"ERROR inserting data: {e}")
        return False
    finally:
        conn.close()


# ==============================================================================
# --- INFERENCE & UTILITY FUNCTIONS ---
# ==============================================================================

def download_image_to_temp(bucket, s3_key):
    url = f"https://{bucket}.s3.ap-south-1.amazonaws.com/{s3_key}"
    local_path = os.path.join(tempfile.gettempdir(), os.path.basename(s3_key))

    print(f"-> Attempting to download {url} to {local_path}")

    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()

        with open(local_path, "wb") as f:
            for chunk in response.iter_content(1024 * 1024):
                f.write(chunk)

        print("-> Download successful.")
        return local_path

    except Exception as e:
        print(f"Error downloading {s3_key} from S3: {e}")
        if os.path.exists(local_path):
            os.remove(local_path)
        return None


def calculate_red_percentage(image_path, red_threshold=150, other_threshold=100):
    """
    Calculates the percentage of "red" pixels in an image. (Unchanged)
    This is used to determine the trashScore (0-100).
    """
    try:
        img = Image.open(image_path).convert('RGB')
        image_array = np.array(img)
        total_pixels = image_array.shape[0] * image_array.shape[1]

        red_mask = (
            (image_array[:, :, 0] > red_threshold) &
            (image_array[:, :, 1] < other_threshold) &
            (image_array[:, :, 2] < other_threshold)
        )
        red_pixel_count = np.count_nonzero(red_mask)
        percentage = min(int((red_pixel_count / total_pixels) * 100 * 2), 100)  # Multiply by 2 and cap at 100 for a more interesting score distribution

        return percentage

    except FileNotFoundError:
        print("Error: Image file not found.")
        return 0
    except Exception as e:
        print(f"An error occurred during image processing: {e}")
        return 0


# ==============================================================================
# --- MAIN POLLER LOGIC (REVISED) ---
# ==============================================================================


def main():
    """Main function to start the SQS polling loop."""
    init_db()
    sqs = boto3.client('sqs', region_name=AWS_REGION)

    print("Poller started. Waiting for messages from SQS...")
    print(f"   (Polling from: {SQS_QUEUE_URL})")

    while True:
        try:
            print("\nPolling for new messages...")
            response = sqs.receive_message(
                QueueUrl=SQS_QUEUE_URL,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=POLL_WAIT_TIME
            )

            if 'Messages' not in response:
                print("   Queue is empty. Sleeping for a moment.")
                time.sleep(LOOP_SLEEP_TIME)
                continue

            for message in response['Messages']:
                receipt_handle = message['ReceiptHandle']
                s3_key = 'UNKNOWN'  # Define early for logging in case of parse failure

                try:
                    # 1. Parse the SQS message body
                    message_data = json.loads(message['Body'])

                    # 2. Extract all necessary fields
                    s3_key = message_data.get('s3Key')
                    s3_location = message_data.get('s3Location')
                    bucket = message_data.get('bucket')
                    capture_timestamp = message_data.get('timestamp')
                    metadata = message_data.get('metadata', {})

                    # Extract location data from nested metadata
                    location_data = metadata.get('location', {})
                    lat = location_data.get('latitude')
                    lng = location_data.get('longitude')

                    if not all([s3_key, s3_location, bucket, capture_timestamp, lat, lng]):
                        raise ValueError("Message missing critical data (s3Key, location, or timestamp).")

                    print(f"   Received message for image: {s3_key}")
                    print(f"   Coordinates: ({lat}, {lng})")

                    # 3. Download the image and calculate the "trash score"
                    temp_image_path = download_image_to_temp(bucket, s3_key)

                    trash_score = 0
                    if temp_image_path:
                        # Use the red percentage as the trash score (0-100)
                        trash_score = run_inference(temp_image_path)
                        os.remove(temp_image_path)  # Clean up the downloaded file

                    print(f"-> Calculated Trash Score: {trash_score}")

                    # 4. Insert data into the 'flights' and 'waypoints' tables
                    success = insert_flight_data(s3_key, s3_location, capture_timestamp, lat, lng, trash_score)

                    if success:
                        print(f"-> Successfully inserted new waypoint for '{s3_key}'.")

                        # 5. Delete the message from SQS ONLY if processing and DB insertion succeeded
                        sqs.delete_message(
                            QueueUrl=SQS_QUEUE_URL,
                            ReceiptHandle=receipt_handle
                        )
                        print(f"-> Deleted message from SQS.")
                    else:
                        print(f"-> Waypoint insertion failed or was skipped for '{s3_key}'. Message will remain in queue.")

                except Exception as e:
                    print(f"CRITICAL ERROR processing message for {s3_key}: {e}")
                    # If an error occurs, the message will not be deleted and will become visible again
                    # after the Visibility Timeout.

        except KeyboardInterrupt:
            print("\nPoller stopped by user.")
            break
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            time.sleep(15)


if __name__ == "__main__":
    main()
