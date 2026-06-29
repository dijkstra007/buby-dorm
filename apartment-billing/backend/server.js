const express = require('express');
const cors = require('cors');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const roomsFilePath = path.join(__dirname, 'data', 'rooms.csv');
const configFilePath = path.join(__dirname, 'data', 'config.csv');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Read CSV file
const readCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// Write CSV file
const writeRoomsCSV = (data) => {
  const csvWriter = createCsvWriter({
    path: roomsFilePath,
    header: [
      { id: 'room_number', title: 'room_number' },
      { id: 'previous_reading', title: 'previous_reading' },
      { id: 'current_reading', title: 'current_reading' },
      { id: 'last_updated', title: 'last_updated' }
    ]
  });
  return csvWriter.writeRecords(data);
};

// Get all rooms
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await readCSV(roomsFilePath);
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Error reading rooms data' });
  }
});

// Get config
app.get('/api/config', async (req, res) => {
  try {
    const config = await readCSV(configFilePath);
    const configObj = {};
    config.forEach(item => {
      configObj[item.setting] = item.value;
    });
    res.json(configObj);
  } catch (error) {
    res.status(500).json({ error: 'Error reading config data' });
  }
});

// Update room reading
app.post('/api/rooms/:roomNumber/reading', async (req, res) => {
  try {
    const { roomNumber } = req.params;
    const { currentReading } = req.body;
    
    const rooms = await readCSV(roomsFilePath);
    const roomIndex = rooms.findIndex(room => room.room_number === roomNumber);
    
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Update previous reading to current reading and set new current reading
    rooms[roomIndex].previous_reading = rooms[roomIndex].current_reading;
    rooms[roomIndex].current_reading = currentReading;
    rooms[roomIndex].last_updated = new Date().toISOString().split('T')[0];
    
    await writeRoomsCSV(rooms);
    res.json({ message: 'Reading updated successfully', room: rooms[roomIndex] });
  } catch (error) {
    res.status(500).json({ error: 'Error updating reading' });
  }
});

// Calculate billing for all rooms
app.get('/api/billing', async (req, res) => {
  try {
    const rooms = await readCSV(roomsFilePath);
    const config = await readCSV(configFilePath);
    
    const configObj = {};
    config.forEach(item => {
      configObj[item.setting] = item.value;
    });
    
    const electricityRate = parseFloat(configObj.electricity_rate_per_unit);
    const currency = configObj.currency;
    
    const billing = rooms.map(room => {
      const unitsUsed = parseFloat(room.current_reading) - parseFloat(room.previous_reading);
      const amount = unitsUsed * electricityRate;
      
      return {
        room_number: room.room_number,
        previous_reading: parseFloat(room.previous_reading),
        current_reading: parseFloat(room.current_reading),
        units_used: unitsUsed,
        rate_per_unit: electricityRate,
        amount: amount,
        currency: currency,
        last_updated: room.last_updated
      };
    });
    
    res.json(billing);
  } catch (error) {
    res.status(500).json({ error: 'Error calculating billing' });
  }
});

// Simple rate limiting
let lastOcrRequest = 0;
const OCR_COOLDOWN = 10000; // 10 seconds between requests

// OCR endpoint for processing images
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    console.log('OCR endpoint called');
    
    // Rate limiting
    const now = Date.now();
    if (now - lastOcrRequest < OCR_COOLDOWN) {
      return res.status(429).json({ 
        error: 'Please wait 10 seconds between OCR requests',
        details: 'Rate limiting to prevent quota exhaustion' 
      });
    }
    lastOcrRequest = now;
    
    if (!req.file) {
      console.log('No image file provided');
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Processing image:', req.file.originalname);
    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Convert image to base64 for Gemini
    const base64Image = imageBuffer.toString('base64');
    
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    
    const prompt = `Extract room numbers (1-10) and electricity readings. Return JSON: {"readings":[{"room_number":"1","current_reading":"123.45"}]}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Clean up the uploaded file
    fs.unlinkSync(imagePath);
    
    try {
      // Parse the JSON response
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsedData = JSON.parse(cleanedText);
      
      // Validate the structure
      if (!parsedData.readings || !Array.isArray(parsedData.readings)) {
        throw new Error('Invalid response format');
      }
      
      // Filter and validate readings
      const validReadings = parsedData.readings.filter(reading => {
        return reading.room_number && 
               reading.current_reading && 
               !isNaN(parseFloat(reading.current_reading)) &&
               parseInt(reading.room_number) >= 1 && 
               parseInt(reading.room_number) <= 10;
      });
      
      res.json({ 
        success: true, 
        readings: validReadings,
        message: `Successfully extracted ${validReadings.length} room readings`
      });
      
    } catch (parseError) {
      console.error('Error parsing OCR response:', parseError);
      res.status(500).json({ 
        error: 'Could not parse the utility readings from the image. Please ensure the handwriting is clear and try again.',
        raw_response: text
      });
    }
    
  } catch (error) {
    console.error('OCR Error:', error);
    console.error('Full error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to process the image. Please try again.',
      details: error.message 
    });
  }
});

// Batch update multiple room readings
app.post('/api/rooms/batch-update', async (req, res) => {
  try {
    const { readings } = req.body;
    
    if (!readings || !Array.isArray(readings)) {
      return res.status(400).json({ error: 'Invalid readings format' });
    }
    
    const rooms = await readCSV(roomsFilePath);
    const updatedRooms = [...rooms];
    const results = [];
    
    for (const reading of readings) {
      const roomIndex = updatedRooms.findIndex(room => room.room_number === reading.room_number);
      
      if (roomIndex !== -1) {
        // Update previous reading to current reading and set new current reading
        updatedRooms[roomIndex].previous_reading = updatedRooms[roomIndex].current_reading;
        updatedRooms[roomIndex].current_reading = reading.current_reading;
        updatedRooms[roomIndex].last_updated = new Date().toISOString().split('T')[0];
        
        results.push({
          room_number: reading.room_number,
          status: 'updated',
          previous_reading: updatedRooms[roomIndex].previous_reading,
          current_reading: updatedRooms[roomIndex].current_reading
        });
      } else {
        results.push({
          room_number: reading.room_number,
          status: 'not_found'
        });
      }
    }
    
    await writeRoomsCSV(updatedRooms);
    
    res.json({ 
      message: 'Batch update completed',
      results: results
    });
    
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Error updating readings' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});