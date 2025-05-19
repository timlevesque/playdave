async function loadQuestion() {
    try {
        const res = await fetch('http://localhost:5000/api/game/question');
        const data = await res.json();

        document.getElementById('prompt').innerText = data.prompt;
        localStorage.setItem('questionId', data.question_id);  // Store current question ID

        checkIfUserAlreadyAnswered();
    } catch (err) {
        document.getElementById('prompt').innerText = "Error loading question.";
    }
}

function checkIfUserAlreadyAnswered() {
    const fullName = localStorage.getItem('fullName');
    const questionId = localStorage.getItem('questionId');
    const submitButton = document.querySelector('button[onclick="submitAnswer()"]');

    if (!fullName || !questionId || !submitButton) return;

    const submissionKey = `answered-${questionId}-${fullName}`;
    
    if (localStorage.getItem(submissionKey)) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-50', 'cursor-not-allowed');
        submitButton.innerText = "Answer Submitted";
        
        // Check if we have a submission ID stored to load explanation
        const submissionId = localStorage.getItem(`submissionId-${questionId}-${fullName}`);
        if (submissionId) {
            loadExplanation(submissionId);
        }
    } else {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
        submitButton.innerText = "Submit";
        document.getElementById('result-container').classList.add('hidden');
    }
}

function submitAnswer() {
    const nameInput = document.getElementById('username').value.trim();
    const nameParts = nameInput.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts[1] || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const userAnswer = document.getElementById('answer').value;
    const questionId = localStorage.getItem('questionId');

    if (!fullName || !userAnswer || !questionId) {
        alert("Please enter your full name and answer.");
        return;
    }

    const submissionKey = `answered-${questionId}-${fullName}`;

    // Check for prior submission
    if (localStorage.getItem(submissionKey)) {
        alert("You've already submitted an answer for this question.");
        return;
    }

    // Save name in localStorage
    localStorage.setItem('fullName', fullName);

    // Show loading state
    document.getElementById('score').innerText = 'Evaluating your answer...';
    document.getElementById('result-container').classList.remove('hidden');
    document.getElementById('explanation').innerHTML = '<p class="text-center text-gray-500">Analyzing your answer...</p>';

    fetch('http://localhost:5000/api/game/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fullName, userAnswer })
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        console.log("Submission response:", data);
        document.getElementById('score').innerText = 'Score: ' + data.score + ' Dave Bucks';

        // Store the submission ID for loading explanations later
        if (data.submission_id) {
            console.log(`Received submission ID: ${data.submission_id}`);
            localStorage.setItem(`submissionId-${questionId}-${fullName}`, data.submission_id);
            
            // Add a small delay before loading explanation to give backend time to process
            document.getElementById('explanation').innerHTML = 
                '<p class="text-center text-gray-500">Generating your explanation...</p>';
                
            // First attempt after a short delay
            setTimeout(() => loadExplanation(data.submission_id), 2000);
            
            // Set up auto-retry if the first attempt fails
            const retryInterval = setInterval(() => {
                const explanationText = document.getElementById('explanation').innerText;
                if (explanationText.includes('still being generated') || 
                    explanationText.includes('Failed to load')) {
                    console.log('Retrying explanation fetch...');
                    loadExplanation(data.submission_id);
                } else {
                    clearInterval(retryInterval);
                }
            }, 5000); // Retry every 5 seconds
            
            // Clear retry interval after 1 minute regardless
            setTimeout(() => clearInterval(retryInterval), 60000);
            
        } else {
            console.error("No submission_id received from server");
            document.getElementById('explanation').innerHTML = 
                '<p class="text-center text-red-500">Could not load explanation: No submission ID received.</p>';
        }

        // Lock future submissions for this question
        localStorage.setItem(submissionKey, 'true');
        checkIfUserAlreadyAnswered();
        loadLeaderboard();
    })
    .catch(err => {
        document.getElementById('score').innerText = 'Error submitting answer.';
        document.getElementById('explanation').innerHTML = '<p class="text-center text-red-500">Failed to evaluate your answer.</p>';
    });
}

async function loadExplanation(submissionId) {
    try {
        document.getElementById('result-container').classList.remove('hidden');
        document.getElementById('explanation').innerHTML = '<p class="text-center text-gray-500">Loading explanation...</p>';
        
        console.log(`Fetching explanation for submission ID: ${submissionId}`);
        
        // Add timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const res = await fetch(`http://localhost:5000/api/game/explanation/${submissionId}`, {
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));
        
        if (!res.ok) {
            console.error(`Server returned error status: ${res.status}`);
            const errorText = await res.text();
            console.error(`Error response: ${errorText}`);
            throw new Error(`Server returned ${res.status}: ${errorText}`);
        }
        
        const data = await res.json();
        console.log("Explanation data received:", data);
        
        if (data.explanation) {
            // Format the explanation text with proper paragraph breaks
            const formattedExplanation = data.explanation
                .split('\n\n')
                .map(paragraph => `<p class="mb-3">${paragraph}</p>`)
                .join('');
                
            document.getElementById('explanation').innerHTML = formattedExplanation;
        } else {
            document.getElementById('explanation').innerHTML = '<p class="text-center text-gray-500">No explanation available.</p>';
        }
    } catch (err) {
        console.error("Failed to load explanation:", err);
        if (err.name === 'AbortError') {
            document.getElementById('explanation').innerHTML = `
                <p class="text-center text-amber-600 mb-2">The explanation is still being generated.</p>
                <p class="text-center text-gray-600">This may take up to 30 seconds to complete.</p>
                <button onclick="loadExplanation('${submissionId}')" class="mt-2 mx-auto block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
                    Try Again
                </button>
            `;
        } else {
            document.getElementById('explanation').innerHTML = `
                <p class="text-center text-red-500 mb-2">Failed to load explanation: ${err.message}</p>
                <button onclick="loadExplanation('${submissionId}')" class="mt-2 mx-auto block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
                    Try Again
                </button>
            `;
        }
    }
}

// Load leaderboard from server
async function loadLeaderboard() {
    const currentUser = localStorage.getItem('fullName');

    const userDisplay = document.getElementById('user-display');
    const signOutBtn = document.getElementById('sign-out-btn');

    if (currentUser) {
        userDisplay.textContent = `You are logged in as: ${currentUser}`;
        signOutBtn.classList.remove('hidden');
    } else {
        userDisplay.textContent = '';
        signOutBtn.classList.add('hidden');
    }

    try {
        const res = await fetch('http://localhost:5000/api/game/leaderboard');
        const data = await res.json();
        const board = document.getElementById('leaderboard');
        board.innerHTML = '';

        const currentUser = localStorage.getItem('fullName');
        document.getElementById('user-display').textContent = currentUser 
            ? `You are logged in as: ${currentUser}` 
            : '';

        const medals = ['🥇', '🥈', '🥉'];

        data.forEach((entry, index) => {
            const li = document.createElement('li');
            li.className = 'bg-white rounded-xl shadow-md px-4 py-3 flex justify-between items-center';

            if (entry.username === currentUser) {
                li.classList.add('border-2', 'border-blue-600');
            }

            // LEFT: Name + Award
            const left = document.createElement('div');
            left.className = 'flex items-center gap-2 text-gray-800 font-medium';

            if (index < 3) {
                const medal = document.createElement('span');
                medal.textContent = medals[index];
                left.appendChild(medal);
            }

            const name = document.createElement('span');
            name.textContent = entry.username;
            left.appendChild(name);

            // RIGHT: Score
            const points = document.createElement('span');
            points.className = 'text-blue-600 font-bold text-lg';
            points.textContent = `${entry.score} Dave Bucks`;

            li.appendChild(left);
            li.appendChild(points);
            board.appendChild(li);
        });
    } catch (err) {
        console.error("Failed to load leaderboard:", err);
    }
}

function signOut() {
    localStorage.removeItem('fullName');
    document.getElementById('username').value = '';
    document.getElementById('user-display').textContent = '';
    document.getElementById('sign-out-btn').classList.add('hidden');
    document.getElementById('result-container').classList.add('hidden');
    loadLeaderboard(); // Refresh leaderboard without highlight
}


// Auto-load name if saved
document.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('fullName');
    if (savedName) {
        document.getElementById('username').value = savedName;
    }

    loadQuestion();
    loadLeaderboard();
    
    // Check if there's a previous submission to load explanation
    const questionId = localStorage.getItem('questionId');
    if (questionId && savedName) {
        const submissionId = localStorage.getItem(`submissionId-${questionId}-${savedName}`);
        if (submissionId) {
            loadExplanation(submissionId);
        }
    }
});

// Auto-refresh leaderboard every 10 seconds
setInterval(loadLeaderboard, 10000);