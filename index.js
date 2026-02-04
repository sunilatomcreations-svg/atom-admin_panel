import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import config from './config/index.js';
import Article from './models/Article.js';
import Catalogue from './models/Catalogue.js';
import Message from './models/Message.js';

// Initialize express app
const app = express();

// MongoDB connection
mongoose.connect(config.mongodb.uri, config.mongodb.options)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
});

// Middleware
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: config.cors.credentials
}));
app.use(express.json());
app.use(fileUpload({
  useTempFiles: config.fileUpload.useTempFiles,
  tempFileDir: config.fileUpload.tempDir,
  limits: { fileSize: config.fileUpload.maxFileSize }
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Test Cloudinary connection and list resources
app.get('/api/test/cloudinary', async (req, res) => {
  try {
    // Test API connection
    const result = await cloudinary.api.resources({
      type: 'upload',
      max_results: 10
    });

    res.json({
      success: true,
      message: 'Cloudinary connection successful',
      data: {
        total_resources: result.total_count,
        sample_resources: result.resources.map(r => ({
          public_id: r.public_id,
          url: r.secure_url,
          created_at: r.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Cloudinary test error:', error);
    res.status(500).json({
      success: false,
      error: 'Cloudinary connection failed',
      details: error.message
    });
  }
});

// Upload image to Cloudinary
app.post('/api/gallery/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const file = req.files.image;
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'gallery',
      upload_preset: config.cloudinary.uploadPreset,
      resource_type: 'auto'
    });

    res.json({
      success: true,
      data: {
        public_id: result.public_id,
        url: result.secure_url,
        thumbnail_url: result.thumbnail_url,
        width: result.width,
        height: result.height,
        format: result.format,
        created_at: result.created_at
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload image',
      details: error.message 
    });
  }
});

// Upload article hero image to Cloudinary (separate folder)
app.post('/api/articles/upload-image', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        success: false,
        error: 'No image file provided' 
      });
    }

    const file = req.files.image;
    
    // Upload to Cloudinary in 'blog-articles' folder
    // Don't use upload_preset as it may override the folder setting
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'blog-articles',
      resource_type: 'auto'
    });

    res.json({
      success: true,
      data: {
        public_id: result.public_id,
        url: result.secure_url,
        thumbnail_url: result.thumbnail_url,
        width: result.width,
        height: result.height,
        format: result.format,
        created_at: result.created_at
      }
    });
  } catch (error) {
    console.error('Article image upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload article image',
      details: error.message 
    });
  }
});

// Fetch all images from Cloudinary
app.get('/api/gallery/images', async (req, res) => {
  try {
    const { max_results = 100, next_cursor, folder } = req.query;

    // Build search expression - fetch all images or from specific folder
    let searchExpression = 'resource_type:image';
    if (folder) {
      searchExpression = `folder:${folder}`;
    }

    console.log('Fetching images with expression:', searchExpression);

    const result = await cloudinary.search
      .expression(searchExpression)
      .sort_by('created_at', 'desc')
      .max_results(max_results)
      .next_cursor(next_cursor)
      .execute();

    console.log(`Found ${result.resources.length} images`);

    res.json({
      success: true,
      data: {
        images: result.resources.map(resource => ({
          public_id: resource.public_id,
          url: resource.secure_url,
          thumbnail_url: cloudinary.url(resource.public_id, {
            width: 400,
            height: 400,
            crop: 'fill',
            quality: 'auto',
            fetch_format: 'auto'
          }),
          width: resource.width,
          height: resource.height,
          format: resource.format,
          created_at: resource.created_at,
          resource_type: resource.resource_type
        })),
        next_cursor: result.next_cursor,
        total_count: result.total_count
      }
    });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch images',
      details: error.message 
    });
  }
});

// Delete all images from Cloudinary (MUST come before single delete route)
app.delete('/api/gallery/images', async (req, res) => {
  try {
    const { folder } = req.query;
    
    // Fetch all images first
    let searchExpression = 'resource_type:image';
    if (folder) {
      searchExpression = `folder:${folder}`;
    }

    const result = await cloudinary.search
      .expression(searchExpression)
      .max_results(500)
      .execute();

    const publicIds = result.resources.map(resource => resource.public_id);
    
    if (publicIds.length === 0) {
      return res.json({
        success: true,
        message: 'No images to delete',
        deleted_count: 0
      });
    }

    console.log(`Deleting ${publicIds.length} images...`);

    // Delete all images in batches
    const deletePromises = publicIds.map(publicId => 
      cloudinary.uploader.destroy(publicId).catch(err => ({
        error: true,
        public_id: publicId,
        message: err.message
      }))
    );

    const deleteResults = await Promise.all(deletePromises);
    
    const successCount = deleteResults.filter(r => !r.error && r.result === 'ok').length;
    const failedCount = deleteResults.filter(r => r.error || r.result !== 'ok').length;

    console.log(`Deleted ${successCount} images, ${failedCount} failed`);

    res.json({
      success: true,
      message: `Deleted ${successCount} images`,
      deleted_count: successCount,
      failed_count: failedCount,
      total_count: publicIds.length
    });
  } catch (error) {
    console.error('Delete all error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete images',
      details: error.message 
    });
  }
});

// Delete image from Cloudinary
app.delete('/api/gallery/images/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    // Decode the public_id (it comes URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    const result = await cloudinary.uploader.destroy(decodedPublicId);

    if (result.result === 'ok') {
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Image not found or already deleted'
      });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete image',
      details: error.message 
    });
  }
});

// Update image metadata (e.g., toggle featured status)
app.patch('/api/gallery/images/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { tags, context } = req.body;
    
    const decodedPublicId = decodeURIComponent(publicId);

    const result = await cloudinary.uploader.explicit(decodedPublicId, {
      type: 'upload',
      tags: tags,
      context: context
    });

    res.json({
      success: true,
      data: {
        public_id: result.public_id,
        tags: result.tags,
        context: result.context
      }
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update image',
      details: error.message 
    });
  }
});

// ============================================
// BLOG ARTICLES ENDPOINTS
// ============================================

// Get all articles
app.get('/api/articles', async (req, res) => {
  try {
    const { status, category, search } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Search by title or excerpt
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }
    
    const articles = await Article.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: articles,
      total: articles.length
    });
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch articles',
      details: error.message
    });
  }
});

// Get single article by ID or slug
app.get('/api/articles/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    // Try to find by ID first, then by slug
    let article = await Article.findById(identifier).catch(() => null);
    
    if (!article) {
      article = await Article.findOne({ slug: identifier });
    }
    
    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }
    
    res.json({
      success: true,
      data: article
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article',
      details: error.message
    });
  }
});

// Create new article
app.post('/api/articles', async (req, res) => {
  try {
    const articleData = {
      ...req.body,
      slug: req.body.slug || req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      date: req.body.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      publishDate: req.body.publishDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
    
    const newArticle = new Article(articleData);
    await newArticle.save();
    
    res.status(201).json({
      success: true,
      data: newArticle,
      message: 'Article created successfully'
    });
  } catch (error) {
    console.error('Create article error:', error);
    
    // Handle duplicate slug error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'An article with this slug already exists',
        details: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create article',
      details: error.message
    });
  }
});

// Update article
app.put('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updatedArticle = await Article.findByIdAndUpdate(
      id,
      { ...req.body },
      { new: true, runValidators: true }
    );
    
    if (!updatedArticle) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }
    
    res.json({
      success: true,
      data: updatedArticle,
      message: 'Article updated successfully'
    });
  } catch (error) {
    console.error('Update article error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update article',
      details: error.message
    });
  }
});

// Delete article
app.delete('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find article first to get the image URL
    const article = await Article.findById(id);
    
    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    // Delete hero image from Cloudinary if it exists
    if (article.heroImg) {
      try {
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/cloud-name/image/upload/v123456/blog-articles/image-id.jpg
        const urlParts = article.heroImg.split('/');
        const uploadIndex = urlParts.indexOf('upload');
        
        if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
          // Get everything after 'upload/v123456/' or 'upload/'
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
          // Remove file extension
          const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
          
          console.log(`Deleting image from Cloudinary: ${publicId}`);
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
        // Continue with article deletion even if Cloudinary deletion fails
      }
    }

    // Delete article from MongoDB
    await Article.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Article and associated image deleted successfully'
    });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete article',
      details: error.message
    });
  }
});

// ==================== CATALOGUE ROUTES ====================

// Get all catalogue PDFs
app.get('/api/catalogue', async (req, res) => {
  try {
    const pdfs = await Catalogue.find().sort({ uploadedAt: -1 });
    
    res.json({
      success: true,
      data: pdfs
    });
  } catch (error) {
    console.error('Get catalogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch catalogue',
      details: error.message
    });
  }
});

// Upload PDF to Cloudinary
app.post('/api/catalogue/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ 
        success: false,
        error: 'No PDF file provided' 
      });
    }

    const file = req.files.pdf;
    
    // Validate file type
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        error: 'Only PDF files are allowed'
      });
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'PDF file must be less than 10MB'
      });
    }
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'catalogue',
      resource_type: 'raw',
      public_id: `pdf_${Date.now()}`
    });

    // Save to MongoDB
    const catalogueItem = new Catalogue({
      name: file.name,
      url: result.secure_url,
      publicId: result.public_id,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`
    });

    await catalogueItem.save();

    res.json({
      success: true,
      data: catalogueItem,
      message: 'PDF uploaded successfully'
    });
  } catch (error) {
    console.error('Catalogue upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload PDF',
      details: error.message 
    });
  }
});

// Delete catalogue PDF
app.delete('/api/catalogue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const catalogueItem = await Catalogue.findById(id);
    
    if (!catalogueItem) {
      return res.status(404).json({
        success: false,
        error: 'Catalogue item not found'
      });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(catalogueItem.publicId, {
        resource_type: 'raw'
      });
    } catch (cloudinaryError) {
      console.error('Cloudinary delete error:', cloudinaryError);
      // Continue with MongoDB deletion even if Cloudinary fails
    }

    // Delete from MongoDB
    await Catalogue.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Catalogue item deleted successfully'
    });
  } catch (error) {
    console.error('Delete catalogue error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete catalogue item',
      details: error.message
    });
  }
});

// ============================================
// MESSAGE ENDPOINTS
// ============================================

// Submit a new message from contact form
app.post('/api/messages', async (req, res) => {
  try {
    const {
      company,
      contactNumber,
      email,
      subject,
      message,
      fabric,
      sizes,
      quantity,
      deadline,
      address,
      budget
    } = req.body;

    let fileUrl = '';
    let fileName = '';

    // Handle file upload if present
    if (req.files && req.files.file) {
      const file = req.files.file;
      fileName = file.name;

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'contact-files',
        resource_type: 'auto'
      });

      fileUrl = result.secure_url;
    }

    // Create new message
    const newMessage = new Message({
      company,
      name: company || 'Website Visitor',
      contactNumber,
      email,
      subject: subject || `Contact form submission from ${company || 'website visitor'}`,
      message,
      fabric,
      sizes,
      quantity,
      deadline,
      address,
      budget,
      fileName,
      fileUrl,
      status: 'new'
    });

    await newMessage.save();

    res.json({
      success: true,
      message: 'Message received successfully',
      data: newMessage
    });
  } catch (error) {
    console.error('Message submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit message',
      details: error.message
    });
  }
});

// Get all messages
app.get('/api/messages', async (req, res) => {
  try {
    const { status } = req.query;
    
    const filter = status && status !== '' ? { status } : {};
    
    const messages = await Message.find(filter).sort({ submittedAt: -1 });
    
    // Transform messages to match frontend format
    const transformedMessages = messages.map(msg => ({
      id: msg._id.toString(),
      name: msg.name || msg.company || 'Unknown',
      email: msg.email,
      subject: msg.subject,
      message: msg.message,
      status: msg.status,
      submittedAt: msg.formattedDate,
      company: msg.company,
      contactNumber: msg.contactNumber,
      fabric: msg.fabric,
      sizes: msg.sizes,
      quantity: msg.quantity,
      deadline: msg.deadline,
      address: msg.address,
      budget: msg.budget,
      fileName: msg.fileName,
      fileUrl: msg.fileUrl
    }));

    res.json({
      success: true,
      data: transformedMessages
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      details: error.message
    });
  }
});

// Update message status
app.patch('/api/messages/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'in-progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value'
      });
    }

    const message = await Message.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: message
    });
  } catch (error) {
    console.error('Update message status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update message status',
      details: error.message
    });
  }
});

// Delete a message
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const message = await Message.findByIdAndDelete(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Delete file from Cloudinary if exists
    if (message.fileUrl) {
      try {
        const publicId = message.fileUrl.split('/').slice(-2).join('/').split('.')[0];
        await cloudinary.uploader.destroy(`contact-files/${publicId}`, {
          resource_type: 'auto'
        });
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
      }
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message',
      details: error.message
    });
  }
});

// Start server
app.listen(config.server.port, () => {
  console.log(`🚀 Server is running on http://localhost:${config.server.port}`);
  console.log(`📷 Cloudinary configured for: ${config.cloudinary.cloudName}`);
  console.log(`🌍 Environment: ${config.server.nodeEnv}`);
});
