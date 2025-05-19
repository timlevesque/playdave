const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

router.get('/question', gameController.getQuestion);
router.post('/submit', gameController.submitAnswer);
router.get('/leaderboard', gameController.getLeaderboard);
router.get('/explanation/:submission_id', gameController.getScoreExplanation);

module.exports = router;