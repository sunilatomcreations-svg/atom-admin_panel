import mongoose from 'mongoose';

const contentBlockSchema = new mongoose.Schema({
  heading: {
    type: String,
    default: ''
  },
  paragraph: {
    type: String,
    default: ''
  }
}, { _id: false });

const articleSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  heroImg: {
    type: String,
    default: ''
  },
  excerpt: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String,
    default: () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  },
  publishDate: {
    type: String,
    default: () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  },
  likes: {
    type: String,
    default: '0'
  },
  shares: {
    type: String,
    default: '0'
  },
  views: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['published', 'draft', 'archived'],
    default: 'draft'
  },
  introduction: {
    type: String,
    default: ''
  },
  content: [contentBlockSchema],
  sidebarItems: [{
    type: String
  }]
}, {
  timestamps: true
});

const Article = mongoose.model('Article', articleSchema);

export default Article;
