const db = require('../config/db');
const { cloudinary, ensureCloudinaryConfig } = require('../config/cloudinary');

const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        return resolve(result);
      }
    );

    stream.end(buffer);
  });
};

const uploadEmployeeAvatar = async (req, res) => {
  try {
    ensureCloudinaryConfig();

    const employeeId = Number(req.params.id);
    const employee = db.prepare('SELECT id, avatar_url FROM employees WHERE id = ?').get(employeeId);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'image file is required (field name: image)' });
    }

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, 'security-company/employees');

    db.prepare('UPDATE employees SET avatar_url = ? WHERE id = ?').run(uploaded.secure_url, employeeId);

    const updated = db
      .prepare('SELECT id, first_name, last_name, avatar_url, employee_type, department, status FROM employees WHERE id = ?')
      .get(employeeId);

    return res.json({ success: true, data: updated, message: 'Employee avatar uploaded successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  uploadEmployeeAvatar
};
