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
    const inputFields = document.querySelector('.space-y-4');
    const resultContainer = document.getElementById('result-container');

    if (!fullName || !questionId || !submitButton) return;

    const submissionKey = `answered-${questionId}-${fullName}`;
    
    if (localStorage.getItem(submissionKey)) {
        // Hide the input fields section instead of just disabling the button
        inputFields.classList.add('hidden');
        
        // Show the result container with score
        resultContainer.classList.remove('hidden');
        
        // Get saved score from localStorage if available
        const savedScore = localStorage.getItem(`score-${questionId}-${fullName}`);
        if (savedScore) {
            document.getElementById('score').innerText = savedScore;
        }
        
        // Check if we have a submission ID stored to load explanation
        const submissionId = localStorage.getItem(`submissionId-${questionId}-${fullName}`);
        if (submissionId) {
            loadExplanation(submissionId);
        }
    } else {
        // Show the input fields if not answered
        inputFields.classList.remove('hidden');
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-50', 'cursor-not-allowed');
        submitButton.innerText = "Submit";
        resultContainer.classList.add('hidden');
    }
}

function submitAnswer() {
    const usernameInput = document.getElementById('username');
    const nameInput = usernameInput.value.trim();
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
    document.getElementById('explanation').innerHTML = `
        <button id="toggle-explanation-btn" onclick="toggleExplanation()" 
          class="w-full flex justify-center items-center py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Show Status <span class="ml-1">▼</span>
        </button>
        <div id="explanation-content" class="mt-3 hidden">
            <p class="text-center text-gray-500">Analyzing your answer...</p>
        </div>
    `;

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
        const scoreText = 'Score: ' + data.score + ' Dave Bucks';
        document.getElementById('score').innerText = scoreText;
        
        // Store the score in localStorage for persistence
        localStorage.setItem(`score-${questionId}-${fullName}`, scoreText);

        // Store the submission ID for loading explanations later
        if (data.submission_id) {
            console.log(`Received submission ID: ${data.submission_id}`);
            localStorage.setItem(`submissionId-${questionId}-${fullName}`, data.submission_id);
            
            // Add a small delay before loading explanation to give backend time to process
            document.getElementById('explanation').innerHTML = `
                <button id="toggle-explanation-btn" onclick="toggleExplanation()" 
                  class="w-full flex justify-center items-center py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    Show Explanation <span class="ml-1">▼</span>
                </button>
                <div id="explanation-content" class="mt-3 hidden">
                    <p class="text-center text-gray-500">Generating your explanation...</p>
                </div>
            `;
                
            // First attempt after a short delay
            setTimeout(() => loadExplanation(data.submission_id), 2000);
            
            // Set up auto-retry if the first attempt fails
            const retryInterval = setInterval(() => {
                const explanationContent = document.getElementById('explanation-content');
                if (!explanationContent) return; // Safety check
                
                const explanationText = explanationContent.innerText;
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
            document.getElementById('explanation').innerHTML = `
                <button id="toggle-explanation-btn" onclick="toggleExplanation()" 
                  class="w-full flex justify-center items-center py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    Show Error <span class="ml-1">▼</span>
                </button>
                <div id="explanation-content" class="mt-3 hidden">
                    <p class="text-center text-red-500">Could not load explanation: No submission ID received.</p>
                </div>
            `;
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

function toggleExplanation() {
    const explanationContent = document.getElementById('explanation-content');
    const toggleButton = document.getElementById('toggle-explanation-btn');
    
    if (explanationContent.classList.contains('hidden')) {
        // Show explanation
        explanationContent.classList.remove('hidden');
        toggleButton.innerHTML = 'Hide Explanation <span class="ml-1">▲</span>';
    } else {
        // Hide explanation
        explanationContent.classList.add('hidden');
        toggleButton.innerHTML = 'Show Explanation <span class="ml-1">▼</span>';
    }
}

async function loadExplanation(submissionId) {
    try {
        document.getElementById('result-container').classList.remove('hidden');
        
        // Create toggle button and explanation content container if they don't exist
        let explanationSection = document.getElementById('explanation');
        let toggleButton = document.getElementById('toggle-explanation-btn');
        let explanationContent = document.getElementById('explanation-content');
        
        // If this is the first time loading, set up the structure
        if (!toggleButton) {
            explanationSection.innerHTML = `
                <button id="toggle-explanation-btn" onclick="toggleExplanation()" 
                  class="w-full flex justify-center items-center py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                    Show Explanation <span class="ml-1">▼</span>
                </button>
                <div id="explanation-content" class="mt-3 hidden">
                    <p class="text-center text-gray-500">Loading explanation...</p>
                </div>
            `;
            explanationContent = document.getElementById('explanation-content');
        } else {
            // Just update the loading state
            explanationContent.innerHTML = '<p class="text-center text-gray-500">Loading explanation...</p>';
        }
        
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
                
            explanationContent.innerHTML = formattedExplanation;
        } else {
            explanationContent.innerHTML = '<p class="text-center text-gray-500">No explanation available.</p>';
        }
    } catch (err) {
        console.error("Failed to load explanation:", err);
        const explanationContent = document.getElementById('explanation-content');
        
        if (err.name === 'AbortError') {
            explanationContent.innerHTML = `
                <p class="text-center text-amber-600 mb-2">The explanation is still being generated.</p>
                <p class="text-center text-gray-600">This may take up to 30 seconds to complete.</p>
                <button onclick="loadExplanation('${submissionId}')" class="mt-2 mx-auto block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
                    Try Again
                </button>
            `;
        } else {
            explanationContent.innerHTML = `
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

        if (data.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'text-center text-gray-500 py-4';
            emptyMessage.textContent = 'Be the first to answer today\'s question!';
            board.appendChild(emptyMessage);
            return;
        }

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
    const questionId = localStorage.getItem('questionId');
    const fullName = localStorage.getItem('fullName');
    
    if (questionId && fullName) {
        // Clean up all user-specific data
        localStorage.removeItem(`answered-${questionId}-${fullName}`);
        localStorage.removeItem(`submissionId-${questionId}-${fullName}`);
        localStorage.removeItem(`score-${questionId}-${fullName}`);
    }
    
    localStorage.removeItem('fullName');
    document.getElementById('username').value = '';
    document.getElementById('username').classList.remove('hidden');
    document.getElementById('user-display').textContent = '';
    document.getElementById('sign-out-btn').classList.add('hidden');
    document.getElementById('result-container').classList.add('hidden');
    
    // Show input fields when signing out
    document.querySelector('.space-y-4').classList.remove('hidden');
    
    loadLeaderboard(); // Refresh leaderboard without highlight
}


document.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('fullName');
    const usernameInput = document.getElementById('username');
    
    if (savedName) {
        // If name is already stored, hide the input field and set its value
        usernameInput.value = savedName;
        usernameInput.classList.add('hidden');
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