const express = require('express');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware to parse incoming JSON requests
app.use(express.json());

const rateLimit = require('express-rate-limit');

// Create a rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});

// Apply to all requests or specific routes
app.use(limiter);

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID, 
    key_secret: process.env.KEY_SECRET 
});

let orderId;

const { body, validationResult } = require('express-validator');

// Endpoint to create-order
app.post('/create-order', [
    body('amount').isNumeric().withMessage('Amount must be a number').notEmpty().withMessage('Amount is required'),
    // Add other validation rules as needed
], async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const options = {
        amount: req.body.amount,
        currency: 'INR',
        receipt: 'Swagatam Railway Study Center',
    };

    try {
        const order = await razorpay.orders.create(options);
        orderId = order.orderId;
        return res.json(order);
    } catch (error) {
        console.error('Error creating order:', error);
        return res.status(500).send('Error creating order');
    }
});

const crypto = require('crypto');

// POST endpoint for payment verification
app.post('/verify-payment', [
    body('razorpay_payment_id').notEmpty().withMessage('razorpay_payment_id is required'),
    body('razorpay_signature').notEmpty().withMessage('razorpay_signature is required'),
    body('email').isEmail().withMessage('A valid email is required').notEmpty().withMessage('Email is required'),
], async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { razorpay_payment_id, razorpay_signature, email } = req.body;

    // Retrieve order_id from your server (e.g., from database)
    const order_id = orderId;

    // Generate HMAC signature
    const generated_signature = crypto.createHmac('sha256', process.env.KEY_SECRET)
        .update(`${order_id}|${razorpay_payment_id}`)
        .digest('hex');

    // Verify the signature
    if (generated_signature === razorpay_signature) {
        // Payment is successful
        await sendEmail(email, razorpay_payment_id);
        return res.status(200).json({ success: true, message: 'Payment verified successfully' });
    } else {
        // Signature mismatch
        return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
});

// Function to send email
async function sendEmail(to, paymentId) {
    // Set up email transport
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: 'Payment Confirmation',
        text: `Your payment with ID: ${paymentId} has been successfully processed.\nPlease find your zip file`,
        attachments: [
            {
                filename: 'notes.zip',
                path: './notes.zip', // Ensure this path is correct
            },
        ],
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        throw error; // Rethrow to handle it in verify-payment
    }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
    console.error('Error starting the server:', err);
});
