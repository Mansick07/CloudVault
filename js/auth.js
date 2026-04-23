document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const toggleAuth = document.getElementById('toggle-auth');
    const authSubmit = document.getElementById('auth-submit');
    const authTitle = document.querySelector('.login-title');
    const authProgress = document.getElementById('auth-progress');
    
    let isLogin = true;

    // Check if user is already logged in
    account.get().then(
        function (response) {
            // Logged in, redirect to dashboard
            window.location.href = 'index.html';
        },
        function (error) {
            // Not logged in, stay on this page
            console.log('User not logged in, show login form');
        }
    );

    // Toggle between Login and Signup modes
    toggleAuth.addEventListener('click', (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        if (isLogin) {
            authTitle.textContent = 'Sign in';
            toggleAuth.textContent = 'Create account';
            authSubmit.textContent = 'Next';
        } else {
            authTitle.textContent = 'Sign up';
            toggleAuth.textContent = 'Sign in instead';
            authSubmit.textContent = 'Sign up';
        }
    });

    // Handle form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        authProgress.classList.remove('hide');
        authSubmit.disabled = true;

        try {
            if (isLogin) {
                // Login
                // Note: v14 uses createEmailPasswordSession
                await account.createEmailPasswordSession(email, password);
            } else {
                // Signup
                await account.create(ID.unique(), email, password);
                // Auto login after signup
                await account.createEmailPasswordSession(email, password);
            }
            
            // Redirect to dashboard on success
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error(error);
            M.toast({html: error.message, classes: 'red rounded'});
        } finally {
            authProgress.classList.add('hide');
            authSubmit.disabled = false;
        }
    });
});
