import json
import sqlite3
from flask import Flask, jsonify, g, request
from typing import List, Dict, Any
from flask_cors import CORS
import os # Import os for checking file existence

# --- Configuration and Data ---

DATABASE = 'flight_data.db'
DAL_LAKE_CENTER = {"lat": 34.0911, "lng": 74.8697}

# --- Flask App and SQLite Setup ---

app = Flask(__name__)
CORS(app)

def get_db_connection():
    """Establishes a connection to the SQLite database and returns it."""
    # Check if connection exists on the global object 'g'
    db = getattr(g, '_database', None)
    if db is None:
        # Create connection, set row_factory to sqlite3.Row for dictionary-like access
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    """Closes the database connection at the end of the request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db(overwrite=False):
    """
    Initializes the database: creates the tables if they DO NOT EXIST.
    It no longer drops tables or inserts mock data unless explicitly requested (not shown here).
    """
    with app.app_context():
        db = get_db_connection()
        cursor = db.cursor()

        # 1. Create flights table IF NOT EXISTS
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS flights (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL
            );
        """)

        # 2. Create waypoints table IF NOT EXISTS
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS waypoints (
                id TEXT PRIMARY KEY,
                flight_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                trashScore INTEGER NOT NULL,
                imageUrl TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (flight_id) REFERENCES flights (id)
            );
        """)

        db.commit()
    print("Database structure verified. Existing data preserved.")


# --- API Endpoints (UNMODIFIED) ---

@app.route("/", methods=["GET"])
def home():
    """Root endpoint to confirm the API is running."""
    return jsonify({
        "status": "success",
        "message": "Drone Flight Path API is operational and backed by SQLite.",
        "endpoints": {
            "all_flights": "/flights",
            "specific_flight": "/flights/<flight_id>"
        }
    })

@app.route("/flights", methods=["GET"])
def get_all_flights():
    """Endpoint to return a list of all available flight paths from the database, reconstructing the nested structure."""
    conn = get_db_connection()

    # 1. Fetch all flights (main data)
    flights_data = conn.execute("SELECT id, date FROM flights").fetchall()

    # 2. Fetch all waypoints (related data)
    # Ordering by timestamp ensures the waypoints are in the correct sequence for each path
    waypoints_data = conn.execute("SELECT * FROM waypoints ORDER BY flight_id, timestamp ASC").fetchall()

    # 3. Group waypoints by flight_id for efficient merging
    waypoints_by_flight = {}
    for row in waypoints_data:
        wp = dict(row)
        # We don't want the foreign key in the final waypoint JSON object
        flight_id = wp.pop('flight_id')
        
        if flight_id not in waypoints_by_flight:
            waypoints_by_flight[flight_id] = []
        waypoints_by_flight[flight_id].append(wp)

    # 4. Combine flights and their respective waypoints
    result = []
    for flight_row in flights_data:
        flight = dict(flight_row)
        # Ensure we don't return null if a flight has no waypoints (e.g., if it's a new flight created by the poller)
        flight['waypoints'] = waypoints_by_flight.get(flight['id'], [])
        result.append(flight)

    return jsonify(result)

@app.route("/flights/<flight_id>", methods=["GET"])
def get_flight(flight_id: str):
    """Endpoint to return a specific flight path by its ID from the database."""
    conn = get_db_connection()

    # 1. Fetch flight details
    flight_row = conn.execute(
        "SELECT id, date FROM flights WHERE id = ?",
        (flight_id,)
    ).fetchone()

    if not flight_row:
        return jsonify({
            "status": "error",
            "message": f"Flight path with ID '{flight_id}' not found."
        }), 404

    flight = dict(flight_row)

    # 2. Fetch related waypoints
    waypoints_data = conn.execute(
        "SELECT id, lat, lng, trashScore, imageUrl, timestamp FROM waypoints WHERE flight_id = ? ORDER BY timestamp ASC",
        (flight_id,)
    ).fetchall()

    # 3. Combine and return
    flight['waypoints'] = [dict(wp) for wp in waypoints_data]
    return jsonify(flight)

# --- Application Startup ---

if __name__ == "__main__":
    # Initialize the database structure (tables created IF NOT EXISTS)
    init_db()
    app.run(debug=True, host='127.0.0.1', port=1234)
