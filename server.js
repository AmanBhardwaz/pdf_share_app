const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
fs.ensureDirSync('uploads');

// In-memory storage for file metadata (in production, use a database)
const fileMetadata = new Map();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `${fileId}${extension}`;
    
    // Store metadata
    fileMetadata.set(fileId, {
      id: fileId,
      originalName: file.originalname,
      filename: filename,
      uploadDate: new Date(),
      size: 0 // Will be updated after upload
    });
    
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload PDF
app.post('/api/upload', upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
    const metadata = fileMetadata.get(fileId);
    
    if (metadata) {
      metadata.size = req.file.size;
      fileMetadata.set(fileId, metadata);
    }

    res.json({
      success: true,
      fileId: fileId,
      originalName: req.file.originalname,
      size: req.file.size,
      shareUrl: `${req.protocol}://${req.get('host')}/share/${fileId}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get file info
app.get('/api/file/:id', (req, res) => {
  const fileId = req.params.id;
  const metadata = fileMetadata.get(fileId);
  
  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json(metadata);
});

// Share page
app.get('/share/:id', (req, res) => {
  const fileId = req.params.id;
  const metadata = fileMetadata.get(fileId);
  
  if (!metadata) {
    return res.status(404).send('File not found');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// View PDF
app.get('/api/view/:id', (req, res) => {
  const fileId = req.params.id;
  const metadata = fileMetadata.get(fileId);
  
  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const filePath = path.join(__dirname, 'uploads', metadata.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
  res.sendFile(filePath);
});

// Download PDF
app.get('/api/download/:id', (req, res) => {
  const fileId = req.params.id;
  const metadata = fileMetadata.get(fileId);
  
  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const filePath = path.join(__dirname, 'uploads', metadata.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
  res.sendFile(filePath);
});

// Get all files (for admin/management)
app.get('/api/files', (req, res) => {
  const files = Array.from(fileMetadata.values());
  res.json(files);
});

// Delete file
app.delete('/api/file/:id', (req, res) => {
  const fileId = req.params.id;
  const metadata = fileMetadata.get(fileId);
  
  if (!metadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const filePath = path.join(__dirname, 'uploads', metadata.filename);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fileMetadata.delete(fileId);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`PDF Sharing Server running on http://localhost:${PORT}`);
});