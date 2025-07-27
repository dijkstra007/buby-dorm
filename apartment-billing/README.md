# Apartment Billing System

A web application for automating electricity billing for apartment rooms. Built with React frontend and Node.js backend, using CSV files for data storage.

## Features

- Track utility readings for 10 apartment rooms
- Calculate electricity bills based on usage difference
- Thai Baht (THB) currency support
- Real-time billing calculations
- Simple CSV-based data storage

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone or download the project
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

### Running the Application

1. Start the backend server:
   ```bash
   cd backend
   npm start
   ```
   The backend will run on http://localhost:3001

2. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```
   The frontend will run on http://localhost:3000

## Usage

1. Open the application in your browser at http://localhost:3000
2. Enter current utility readings for each room
3. Click "Update" to save the readings
4. View the billing summary table showing:
   - Previous and current readings
   - Units used (difference)
   - Amount due in THB
   - Total amount for all rooms

## Configuration

- Electricity rate: 4.50 THB per unit (configurable in `backend/data/config.csv`)
- Room data stored in `backend/data/rooms.csv`

## API Endpoints

- `GET /api/rooms` - Get all room data
- `GET /api/config` - Get configuration settings
- `GET /api/billing` - Get billing calculations
- `POST /api/rooms/:roomNumber/reading` - Update room reading