require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Tambahkan CORS agar bisa diakses dari port yang berbeda
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve file statis dari folder "public"
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi penyimpanan file menggunakan multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// LOGIN Endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Query untuk mendapatkan user berdasarkan username
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !userData) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    // Membandingkan password yang dimasukkan dengan password di database
    if (password === userData.password) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const { judul, rating, tanggal, by } = req.body;

    if (!judul || !rating || !tanggal || !by) {
      console.error('Incomplete metadata');
      return res.status(400).json({ success: false, message: 'Incomplete metadata' });
    }

    // Determine the sign value based on the 'by' field
    let sign = null;
    if (by === 'Aca') {
      sign = 'paw1.png';
    } else if (by === 'Alba') {
      sign = 'paw2.png';
    }

    let signedURL = null;

    if (file) {
      const fileName = `${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
        });

      if (error) {
        console.error('Error uploading to Supabase:', error.message);
        return res.status(500).json({ success: false, message: 'Error uploading to Supabase' });
      }

      // Get signed URL
      const { signedURL: url, error: urlError } = await supabase.storage
        .from('uploads')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);

      if (urlError) {
        console.error('Error getting signed URL:', urlError.message);
        return res.status(500).json({ success: false, message: 'Error generating signed URL' });
      }

      signedURL = url;
    }

    // Insert data including 'sign' into the images table
    const { data: insertData, error: insertError } = await supabase
      .from('images')
      .insert([
        { 
          image_url: signedURL,  // Make sure the signedURL is passed here
          judul,
          rating,
          tanggal,
          by,
          sign // Insert the sign value
        }
      ]);

    if (insertError) {
      console.error('Error inserting metadata into Supabase:', insertError.message);
      return res.status(500).json({ success: false, message: 'Error inserting metadata' });
    }

    res.json({ success: true, imageUrl: signedURL });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
});


// API endpoint untuk daftar gambar dengan pagination
app.get('/images', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const offset = (page - 1) * limit;
    const filter = req.query.filter || ''; // Mendapatkan filter dari query string
    const search = req.query.search || ''; // Mendapatkan pencarian dari query string

    // Query ke Supabase dengan limit, offset, filter, dan urutkan berdasarkan abjad (judul)
    let query = supabase
      .from('images')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('judul', { ascending: true }); // Mengurutkan berdasarkan judul (abjad)

    if (filter) {
      query = query.ilike('by', filter); // Menerapkan filter jika ada
    }
    
    if (search) {
      query = query.ilike('judul', `%${search}%`); // Menerapkan pencarian berdasarkan judul jika ada
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error listing images:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to list images' });
    }

    res.json({
      success: true,
      images: data,
      totalPages: Math.ceil(count / limit) // Menghitung total halaman
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch images' });
  }
});


// Jalankan server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});