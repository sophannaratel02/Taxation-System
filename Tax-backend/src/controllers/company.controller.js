const express = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { prepareCompanyProfile } = require('../services/annexProfiles');
const { getOrCreateOwnedCompany } = require('../services/companyProfile');

const router = express.Router();
router.use(authenticate);

router.get('/profile', async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const company = await getOrCreateOwnedCompany(connection, req.user, true);
    await connection.commit();
    transactionStarted = false;
    const [profileRows] = await pool.query(
      `SELECT *, DATE_FORMAT(tax_registered_date, '%Y-%m-%d') AS tax_registered_date_iso
       FROM companies WHERE id = ?`,
      [company.id]
    );
    const profile = profileRows[0];
    res.json({
      id: Number(profile.id),
      enterprise_name: profile.enterprise_name,
      tin: profile.tin,
      tax_registered_date: profile.tax_registered_date_iso || '',
      director_name: profile.director_name || '',
      business_activity: profile.business_activity || '',
      accountant_name: profile.accountant_name || '',
      registered_address: profile.registered_address || '',
      office_phone: profile.office_phone || '',
      official_email: profile.official_email || '',
      owner_user_id: profile.owner_user_id === null ? null : Number(profile.owner_user_id),
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    next(error);
  } finally {
    connection?.release();
  }
});

router.put('/profile', async (req, res, next) => {
  let connection;
  let transactionStarted = false;
  try {
    const profile = prepareCompanyProfile(req.body || {});
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const company = await getOrCreateOwnedCompany(connection, req.user);
    await connection.query(
      `UPDATE companies SET enterprise_name = ?, tin = ?, tax_registered_date = ?,
         director_name = ?, business_activity = ?, accountant_name = ?, registered_address = ?,
         office_phone = ?, official_email = ?
       WHERE id = ?`,
      [
        profile.enterpriseName,
        profile.tin,
        profile.taxRegisteredDate,
        profile.directorName,
        profile.businessActivity,
        profile.accountantName,
        profile.registeredAddress,
        profile.officePhone,
        profile.officialEmail,
        company.id,
      ]
    );
    await connection.query(
      'UPDATE users SET enterprise_name = ?, office_phone = ? WHERE id = ?',
      [profile.enterpriseName, profile.officePhone, req.user.id]
    );
    const [updated] = await connection.query(
      `SELECT *, DATE_FORMAT(tax_registered_date, '%Y-%m-%d') AS tax_registered_date_iso
       FROM companies WHERE id = ?`,
      [company.id]
    );
    await connection.commit();
    transactionStarted = false;
    res.json({
      ...updated[0],
      id: Number(updated[0].id),
      owner_user_id: updated[0].owner_user_id === null ? null : Number(updated[0].owner_user_id),
      tax_registered_date: updated[0].tax_registered_date_iso,
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'This TIN is already registered to another company.';
    }
    next(error);
  } finally {
    connection?.release();
  }
});

module.exports = router;
