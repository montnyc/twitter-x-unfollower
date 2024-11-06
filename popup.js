let port = null;

document.getElementById('maxUnfollows').addEventListener('change', (e) => {
    document.getElementById('targetCount').textContent = e.target.value;
});

document.getElementById('startUnfollow').addEventListener('click', async () => {
    const maxUnfollows = document.getElementById('maxUnfollows').value;
    const delay = document.getElementById('delay').value;

    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        document.getElementById('status').textContent = 'Please navigate to Twitter/X first!';
        return;
    }

    // Enable stop button and disable start button
    document.getElementById('startUnfollow').disabled = true;
    document.getElementById('stopUnfollow').disabled = false;

    // Reset counters
    updateProgress(0, maxUnfollows);

    // Inject the content script
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: startUnfollowing,
        args: [parseInt(maxUnfollows), parseInt(delay)]
    });
});

document.getElementById('stopUnfollow').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send stop message to content script
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: stopUnfollowing
    });

    // Update button states
    document.getElementById('startUnfollow').disabled = false;
    document.getElementById('stopUnfollow').disabled = true;
    document.getElementById('status').textContent = 'Stopped';
});

function updateProgress(current, total) {
    // Update counter
    document.getElementById('unfollowCount').textContent = current;

    // Update progress bar
    const percentage = (current / total) * 100;
    document.getElementById('progressBar').style.width = `${percentage}%`;

    // Update status
    if (current === 0) {
        document.getElementById('status').textContent = 'Ready to start';
    } else if (current === total) {
        document.getElementById('status').textContent = 'Complete!';
    } else {
        document.getElementById('status').textContent = 'Unfollowing...';
    }
}

// Function that will be injected into the page
function startUnfollowing(maxUnfollows, delaySeconds) {
    window.isUnfollowingActive = true;

    async function unfollowWithDelay(button) {
        return new Promise(resolve => {
            setTimeout(async () => {
                // Click the initial unfollow button
                button.click();

                // Wait for the confirmation modal to appear
                setTimeout(() => {
                    // Find and click the confirmation button in the modal
                    const confirmButton = document.querySelector('button[data-testid="confirmationSheetConfirm"]');
                    if (confirmButton) {
                        confirmButton.click();
                        resolve(true);
                    } else {
                        console.log('Could not find confirmation button');
                        resolve(false);
                    }
                }, delaySeconds * 500); // Half the delay for modal
            }, delaySeconds * 1000);
        });
    }

    async function scrollPage() {
        return new Promise(resolve => {
            const scrollDistance = 1000;
            window.scrollBy(0, scrollDistance);
            setTimeout(resolve, 2000);
        });
    }

    async function massUnfollow() {
        let unfollowCount = 0;

        while (unfollowCount < maxUnfollows && window.isUnfollowingActive) {
            const unfollowButtons = document.querySelectorAll('button[data-testid$="-unfollow"]');

            if (unfollowButtons.length === 0) {
                console.log('No more unfollow buttons found. Scrolling...');
                await scrollPage();
                continue;
            }

            for (const button of unfollowButtons) {
                if (!window.isUnfollowingActive) break;
                if (unfollowCount >= maxUnfollows) break;

                try {
                    const success = await unfollowWithDelay(button);
                    if (success) {
                        unfollowCount++;
                        // Use Chrome runtime messaging instead of window.postMessage
                        chrome.runtime.sendMessage({
                            type: 'unfollowProgress',
                            current: unfollowCount,
                            total: maxUnfollows
                        });
                    }
                } catch (error) {
                    console.error('Error unfollowing:', error);
                }
            }

            await scrollPage();
        }

        // Send completion message using Chrome messaging
        chrome.runtime.sendMessage({
            type: 'unfollowComplete'
        });
    }

    massUnfollow().catch(console.error);
}

function stopUnfollowing() {
    window.isUnfollowingActive = false;
}

// Replace window message listener with Chrome runtime message listener
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'unfollowProgress') {
        updateProgress(message.current, message.total);
    } else if (message.type === 'unfollowComplete') {
        document.getElementById('startUnfollow').disabled = false;
        document.getElementById('stopUnfollow').disabled = true;
    }
});