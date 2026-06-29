const { GoogleGenerativeAI } = require('@google/generative-ai');

// Test OCR with a simple text prompt
async function testOCR() {
  try {
    console.log('Testing Gemini OCR...');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    
    const prompt = `
    Analyze this handwritten utility reading sheet for apartment rooms. 
    Extract room numbers (1-10) and their corresponding current electricity meter readings.
    
    Return the data in this exact JSON format:
    {
      "readings": [
        {"room_number": "1", "current_reading": "123.45"},
        {"room_number": "2", "current_reading": "234.56"}
      ]
    }
    
    Rules:
    - Only extract room numbers 1-10
    - Only include rooms where you can clearly see both room number and reading
    - Current reading should be a number (can have decimals)
    - If handwriting is unclear, skip that room
    - Return valid JSON only, no additional text
    
    Example data:
    Room 1: 150
    Room 2: 200
    Room 3: 175
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Raw response:', text);
    
    // Try to parse JSON
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);
    
    console.log('✅ Parsed data:', parsedData);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testOCR();