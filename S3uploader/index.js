// --- Imports ---
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const AWS = require("aws-sdk");

// --- Configuration Setup ---
const PORT = process.env.PORT || 5000;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

// --- App Initialization ---
const app = express();
app.use(cors({ origin: "*" }));


// --- 1. Request Logging Middleware ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// Multer handles multipart/form-data uploads
const upload = multer({ storage: multer.memoryStorage() });

// AWS S3 and SQS configuration
const awsConfig = {
  region: process.env.AWS_REGION,
  // NOTE: For production, always use environment variables
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
};

const s3 = new AWS.S3(awsConfig);
const sqs = new AWS.SQS(awsConfig);

// --- 2. Health Check Endpoint ---
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "S3 Uploader Service is running.",
    timestamp: new Date().toISOString(),
    port: PORT,
  });
});

// --- 3. Upload Endpoint ---
app.post(
  "/upload",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "metadata", maxCount: 1 },
  ]),
  async (req, res) => {
    let filename = "";
    let fileUrl = "";
    let parsedMetadata = {};

    try {
      // Multer puts uploaded files in req.files
      const uploadedFile =
        req.files && req.files.file && req.files.file.length > 0
          ? req.files.file[0]
          : null;

      if (!uploadedFile) {
        return res
          .status(400)
          .json({ error: "No file provided under the 'file' field." });
      }

      console.log(req.body);

      // --- 1. Parse Metadata ---
      const metadataString = req.body.metadata;
      if (!metadataString) {
        return res
          .status(400)
          .json({ error: "No metadata provided under the 'metadata' field." });
      }

      try {
        parsedMetadata = JSON.parse(metadataString);

        // Optional: Basic validation
        if (
          typeof parsedMetadata.lat !== "number" ||
          typeof parsedMetadata.lng !== "number" ||
          typeof parsedMetadata.accuracy !== "number"
        ) {
          console.warn("Metadata structure mismatch. Received:", parsedMetadata);
        }
      } catch (parseError) {
        console.error("Failed to parse metadata JSON:", parseError);
        return res
          .status(400)
          .json({ error: "Invalid JSON format for metadata field." });
      }

      // --- 2. Upload to S3 ---
      const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
      filename = `drone-capture-${timestamp}-${uploadedFile.originalname}`;

      const s3Params = {
        Bucket: "bis-dal-aerial",
        Key: filename,
        Body: uploadedFile.buffer,
        ContentType: uploadedFile.mimetype,
      };

      const uploadResult = await s3.upload(s3Params).promise();
      fileUrl = uploadResult.Location;

      console.log(`Successfully uploaded file to S3: ${filename}`);

      // --- 3. Send message to SQS ---
      const sqsMessageBody = JSON.stringify({
        s3Key: filename,
        s3Location: fileUrl,
        bucket: "bis-dal-aerial",
        mimeType: uploadedFile.mimetype,
        timestamp: new Date().toISOString(),
        metadata: parsedMetadata,
      });

      const sqsParams = {
        MessageBody: sqsMessageBody,
        QueueUrl: SQS_QUEUE_URL,
      };

      await sqs.sendMessage(sqsParams).promise();

      console.log(`Successfully queued message for file: ${filename}`);

      // Respond to client
      res.json({
        url: fileUrl,
        message: "File uploaded and processing task queued.",
        sqsQueue: SQS_QUEUE_URL,
        uploadedMetadata: parsedMetadata,
      });
    } catch (err) {
      let errorMessage = err.message || "Unknown error";
      if (err.code === "NetworkingError") {
        errorMessage = "Network connection issue or AWS region/endpoint mismatch.";
      } else if (err.code === "AccessDenied") {
        errorMessage = "AWS credentials are incorrect or access denied.";
      }

      console.error(`Processing Error for file ${filename}:`, err);
      res.status(500).json({ error: `Operation failed. Details: ${errorMessage}` });
    }
  }
);

// --- Start Server ---
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});

