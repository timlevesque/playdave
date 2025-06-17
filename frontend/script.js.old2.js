function getLocalDateString() {
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); // adjust to local timezone
    return local.toISOString().split('T')[0];
}

async function loadQuestion() {
    try {
        const res = await fetch(`/api/game/question?localDate=${getLocalDateString()}`);
        const data = await res.json();

        document.getElementById('prompt').innerText = data.prompt;
        localStorage.setItem('questionId', data.question_id);  // Store current question ID

        checkIfUserAlreadyAnswered();
        updateUserInterface();
    } catch (err) {
        document.getElementById('prompt').innerText = "Error loading question.";
    }
}

function checkIfUserAlreadyAnswered() {
    const fullName = localStorage.getItem('fullName');
    const questionId = localStorage.getItem('questionId');
    const submitButton = document.querySelector('button[onclick="submitAnswer()"]');
    const inputFields = document.getElementById('input-section');
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

    if (userAnswer.length < 20) {
    alert("Your answer must be at least 20 characters or more");
    return;
    }


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

    fetch('/api/game/submit', {
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

        posthog.capture('submitted_answer', {
                name: fullName,
                questionId: questionId,
                score: data.score
            });

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
        updateUserInterface();
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
        
        const res = await fetch(`/api/game/explanation/${submissionId}`, {
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
    try {
        const localDate = getLocalDateString();
        const res = await fetch(`/api/game/leaderboard?localDate=${localDate}`);
        const data = await res.json();
        const board = document.getElementById('leaderboard');
        board.innerHTML = '';

        const currentUser = localStorage.getItem('fullName');
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
            points.className = 'text-blue-600 font-bold';
            points.textContent = `${entry.score} Dave Bucks`;

            li.appendChild(left);
            li.appendChild(points);
            board.appendChild(li);
        });
    } catch (err) {
        console.error("Failed to load leaderboard:", err);
    }
}

// Function to get user initials from full name
function getUserInitials(fullName) {
    if (!fullName) return '';
    
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();
    
    return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
    
}

// Update user circle, dropdown, and welcome message
function updateUserInterface() {
    setupShareWidget();
    const fullName = localStorage.getItem('fullName');
    const userCircle = document.getElementById('user-circle');
    const welcomeMessage = document.getElementById('welcome-message');
    const dropdownUsername = document.getElementById('dropdown-username');
    
    posthog.identify(fullName, { name: fullName });
        if (fullName) {
        // Update and show user circle with initials
        userCircle.textContent = getUserInitials(fullName);
        userCircle.classList.remove('hidden');
        
        // Update dropdown username
        dropdownUsername.textContent = fullName;
        
        // Show welcome message with user's first name
        const firstName = fullName.split(' ')[0];
        document.getElementById('welcome-name').textContent = firstName;
        welcomeMessage.classList.remove('hidden');
        
        // Hide username input if we already have a name
        document.getElementById('username').classList.add('hidden');
    } else {
        // Hide user circle and welcome message if no user
        userCircle.classList.add('hidden');
        welcomeMessage.classList.add('hidden');
        
        // Show username input
        document.getElementById('username').classList.remove('hidden');
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
    document.getElementById('user-dropdown').classList.add('hidden');
    document.getElementById('result-container').classList.add('hidden');
    
    // Show input fields when signing out
     document.getElementById('input-section').classList.remove('hidden');
    
    // Update UI elements
    updateUserInterface();
    loadLeaderboard(); // Refresh leaderboard without highlight
}

document.addEventListener('DOMContentLoaded', () => {
    
    
    const savedName = localStorage.getItem('fullName');
    if (savedName) {
        document.getElementById('username').value = savedName;
    }

    loadQuestion();
    updateUserInterface();
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

function shareScore() {
        posthog.capture('clicked_share_score', {
        name: localStorage.getItem('fullName'),
        questionId: localStorage.getItem('questionId')
    });

    const message = document.getElementById('share-message').textContent;

    navigator.clipboard.writeText(message)
        .then(() => {
            const btn = document.getElementById('share-score-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.disabled = true;

            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        })
        .catch(err => {
            console.error("Clipboard error:", err);
            alert("Failed to copy to clipboard.");
        });
}

function setupShareWidget() {
    const fullName = localStorage.getItem('fullName');
    const questionId = localStorage.getItem('questionId');

    if (!fullName || !questionId) return;

    const scoreText = localStorage.getItem(`score-${questionId}-${fullName}`);
    if (!scoreText) return;

    const scoreMatch = scoreText.match(/\d+/);
    if (!scoreMatch) return;

    const scoreNumber = scoreMatch[0];
    const shareText = 
        `🏆 I earned ${scoreNumber} Dave Bucks\n` +
        `on today’s Question of the Day!\n\n` +
        `Can you beat me?\n👉 Play now: ${window.location.origin}`;

    document.getElementById('share-message').textContent = shareText;
    document.getElementById('share-widget').classList.remove('hidden');
}

// Toggle dropdown visibility
function toggleDropdown() {
const userCircle = document.getElementById('user-circle');
    
   // Toggle dropdown on circle click
    userCircle.addEventListener('click', toggleDropdown);

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('user-dropdown');
        if (!dropdown.classList.contains('hidden') &&
            !userCircle.contains(event.target) &&
            !dropdown.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

