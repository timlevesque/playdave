require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Submission = require('../models/Submission');
const { Configuration, OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function getQuestions() {
    // Read and parse questions fresh each time
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../questions.json')));
}

function getTodayQuestion() {
    const today = getTodayDate();
    const questions = getQuestions(); // Get fresh questions data
    
    console.log(`Current date: ${today}`);
    console.log(`Available questions:`, questions.map(q => ({ id: q.question_id, date: q.date })));
    
    return questions.find(q => q.date === today);
}

// Endpoint
exports.getQuestion = (req, res) => {
    const todayQuestion = getTodayQuestion();
    
    if (!todayQuestion) {
        return res.status(404).json({ error: 'No question found for today.' });
    }

    res.json({
        question_id: todayQuestion.question_id,
        prompt: todayQuestion.prompt,
        main_answer: todayQuestion.main_answer,
        date: todayQuestion.date
    });
};

exports.submitAnswer = async (req, res) => {
    const todayQuestion = getTodayQuestion();
    
    if (!todayQuestion) {
        return res.status(404).json({ error: 'No question found for today.' });
    }
    
    const { username, userAnswer } = req.body;
    const prompt = `You are an evaluator for a financial advice game based on dave ramsey principles. Rate the user's advice compared to the reference answer, on a scale from 0 (irrelevant) to 10000 (perfect match in sentiment and recommendation). Points should should be 

Reference Answer: ${todayQuestion.main_answer}

User Answer: ${userAnswer}

Only return a number between 0 and 10000 with variance of 1.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
    });

    const score = parseInt(response.choices[0].message.content.match(/\d+/)[0]);

    const submission = new Submission({
        date: getTodayDate(),
        question_id: todayQuestion.question_id,
        username,
        userAnswer,
        score
    });

    await submission.save();
    res.json({ 
        score,
        submission_id: submission._id
    });
};

exports.getLeaderboard = async (req, res) => {
    const today = getTodayDate();
    const todayQuestion = getTodayQuestion();
    
    if (!todayQuestion) {
        return res.status(404).json({ error: 'No question found for today.' });
    }
    
    const submissions = await Submission.find({ date: today, question_id: todayQuestion.question_id })
        .sort({ score: -1 });
    res.json(submissions);
};

exports.getScoreExplanation = async (req, res) => {
    try {
        const { submission_id } = req.params;
        
        console.log(`Processing explanation request for submission ID: ${submission_id}`);
        
        if (!submission_id) {
            console.error('Missing submission_id in request params');
            return res.status(400).json({ error: 'Submission ID is required' });
        }
        
        // Find the user's submission
        const submission = await Submission.findById(submission_id);
        
        if (!submission) {
            console.error(`Submission not found for ID: ${submission_id}`);
            return res.status(404).json({ error: 'Submission not found' });
        }
        
        console.log(`Found submission: ${submission._id}, question_id: ${submission.question_id}`);
        
        // Get the question details - using fresh data
        const questions = getQuestions();
        const questionData = questions.find(q => q.question_id === submission.question_id);
        
        if (!questionData) {
            console.error(`Question data not found for question_id: ${submission.question_id}`);
            return res.status(404).json({ error: 'Question data not found' });
        }
        
        // Check if explanation already exists
        if (submission.explanation) {
            console.log('Using cached explanation');
            return res.json({
                submission_id: submission._id,
                score: submission.score,
                explanation: submission.explanation
            });
        }
        
        console.log('Generating new explanation with OpenAI');
        
        // Generate explanation using OpenAI
        const prompt = `You are Dave Ramsey explaining scoring results.
        
Reference Answer: ${questionData.main_answer}

User Answer: ${submission.userAnswer}

The user's answer received a score of ${submission.score} out of 10000.

Please provide an explanation (1 paragraph) of why the user received this score. 
Compare their answer to the reference answer, highlighting:
1. Areas where they aligned well with the reference answer
2. Areas where they missed key points or differed from the reference answer
3. Specific advice on how they could improve their answer
4. use 2nd person language (you, your) to address the user directly.
5. if tjhe reference answser contains two differnt points of view, only score on the one that is most relevant to the user answer. But explain both points of view.
6. Use a friendly and encouraging tone, as if you are a mentor providing constructive feedback.

Your explanation should be constructive and educational, helping the user understand financial concepts better.`;

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-nano",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 1000
            });

            const explanation = response.choices[0].message.content;
            
            // Save the explanation to avoid regenerating it
            submission.explanation = explanation;
            await submission.save();
            
            console.log('Successfully generated and saved explanation');
            
            res.json({
                submission_id: submission._id,
                score: submission.score,
                explanation: explanation
            });
        } catch (openaiError) {
            console.error('OpenAI API error:', openaiError);
            
            // Provide a fallback explanation based on the score
            let fallbackExplanation;
            
            if (submission.score > 8000) {
                fallbackExplanation = `Your answer was excellent, scoring ${submission.score} out of 10000. Your response closely aligned with our reference answer and demonstrated strong financial understanding. You provided clear, practical financial advice that would help someone in this situation make sound decisions.`;
            } else if (submission.score > 5000) {
                fallbackExplanation = `Your answer was good, scoring ${submission.score} out of 10000. You covered many of the key points in our reference answer and showed good financial knowledge. There were some areas where your advice could have been more comprehensive or precise, but overall you provided helpful guidance.`;
            } else if (submission.score > 2000) {
                fallbackExplanation = `Your answer was fair, scoring ${submission.score} out of 10000. While you touched on some important points, there were significant aspects of the financial situation that weren't addressed in your response. Consider exploring more options and providing more specific guidance in future answers.`;
            } else {
                fallbackExplanation = `Your answer scored ${submission.score} out of 10000. There appears to be significant room for improvement in your response. Try to focus more directly on the financial question being asked and provide specific, actionable advice backed by sound financial principles.`;
            }
            
            // Save the fallback explanation
            submission.explanation = fallbackExplanation;
            await submission.save();
            
            res.json({
                submission_id: submission._id,
                score: submission.score,
                explanation: fallbackExplanation
            });
        }
        
    } catch (error) {
        console.error('Error getting score explanation:', error);
        res.status(500).json({ 
            error: 'Failed to get score explanation',
            message: error.message
        });
    }
};