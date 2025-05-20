const mongoose = require('mongoose');

const SubmissionSchema = new mongoose.Schema({
    date: String,
    question_id: String,
    username: String,
    userAnswer: String,
    score: Number,
    explanation: {
        type: String,
        default: null
    }
});

module.exports = mongoose.model('submission', SubmissionSchema);