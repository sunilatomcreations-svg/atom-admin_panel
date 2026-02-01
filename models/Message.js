import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  company: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  contactNumber: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  fabric: {
    type: String,
    default: ''
  },
  sizes: {
    type: String,
    default: ''
  },
  quantity: {
    type: String,
    default: ''
  },
  deadline: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  budget: {
    type: String,
    default: ''
  },
  fileName: {
    type: String,
    default: ''
  },
  fileUrl: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['new', 'in-progress', 'resolved'],
    default: 'new'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for formatted submittedAt
messageSchema.virtual('formattedDate').get(function() {
  const date = new Date(this.submittedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
});

// Ensure virtuals are included in JSON
messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

const Message = mongoose.model('Message', messageSchema);

export default Message;
