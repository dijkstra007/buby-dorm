const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testGemini() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Hello, can you respond?");
    const response = await result.response;
    const text = response.text();
    console.log("✅ Gemini API is working:", text);
  } catch (error) {
    console.error("❌ Gemini API Error:", error.message);
    if (error.message.includes('API key')) {
      console.log("🔑 Please check your Gemini API key");
    }
  }
}

testGemini();