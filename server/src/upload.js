const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '../uploads');

function createStorage(subdir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(UPLOAD_DIR, subdir));
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, uuidv4() + ext);
    }
  });
}

const imageUpload = multer({
  storage: createStorage('images'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

const videoUpload = multer({
  storage: createStorage('videos'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('只允许上传视频'));
  }
});

const voiceUpload = multer({
  storage: createStorage('voices'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的语音格式'));
  }
});

const avatarUpload = multer({
  storage: createStorage('images'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

module.exports = { imageUpload, videoUpload, voiceUpload, avatarUpload };
