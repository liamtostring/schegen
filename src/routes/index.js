const express = require('express');
const router = express.Router();

// Dashboard
router.get('/', (req, res) => {
  res.render('index', {
    title: 'Schema Generator',
    defaultOrg: {
      name: process.env.DEFAULT_ORG_NAME || '',
      url: process.env.DEFAULT_ORG_URL || '',
      logo: process.env.DEFAULT_ORG_LOGO || ''
    }
  });
});

// Results page
router.get('/results', (req, res) => {
  res.render('results', {
    title: 'Schema Results'
  });
});

module.exports = router;
