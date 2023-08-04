// firebase.js
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./user-web-form-7b334-firebase-adminsdk-k308m-d68c077a7e.json'); // Replace with your own path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.databaseURL,
  storageBucket: process.env.storageBucket
});

const db = admin.firestore();
const storage = admin.storage();

module.exports = { db, storage };
