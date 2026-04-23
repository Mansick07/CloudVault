// Theme handling for CloudVault
function toggleDarkMode() {
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    
    body.classList.toggle('dark-mode');
    
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    if (icon) {
        icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    }
}

// Apply theme on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.textContent = 'light_mode';
    }
});
