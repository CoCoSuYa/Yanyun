/**
 * 头像工具
 */
const path = require('path');
const fs = require('fs');

const avatarDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');

function getAvatarExtension(fileName = '', contentType = '') {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  return '';
}

function removeUserAvatarFiles(userId) {
  if (!fs.existsSync(avatarDir)) return;
  const prefix = `${userId}.`;
  for (const file of fs.readdirSync(avatarDir)) {
    if (file.startsWith(prefix)) {
      fs.unlinkSync(path.join(avatarDir, file));
    }
  }
}

module.exports = { getAvatarExtension, removeUserAvatarFiles, avatarDir };
