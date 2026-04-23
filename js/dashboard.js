// This script runs on the dashboard (index.html)
// It checks if a user is logged in. If not, sends them to login.html.

document.addEventListener('DOMContentLoaded', async () => {
    let user;
    try {
        // 1. Check identity first
        user = await account.get();
    } catch (error) {
        console.error('Authentication check failed:', error);
        window.location.href = 'login.html';
        return; // Stop execution
    }

    // 2. If we reach here, user is authenticated. Now initialize the dashboard.
    try {
        // Show user's email in the navbar
        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) {
            userEmailEl.textContent = user.email;
        }

        // Initialize Materialize Components
        M.Dropdown.init(document.querySelectorAll('.dropdown-trigger'), { 
            coverTrigger: false,
            constrainWidth: false 
        });
        M.Modal.init(document.querySelectorAll('.modal'));

        // Load the user's files from Appwrite
        loadFiles();

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        M.toast({html: 'Error loading dashboard data. Check console for details.', classes: 'red'});
    }
});

// Logout function — called when the user clicks the Logout button
async function logout() {
    try {
        await account.deleteSession('current');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}
