// ─── Variables for State ─────────────────────────────────────────────────────
let allDocuments = [];
let allFolders = [];
let selectedFiles = []; 
let currentView = 'drive'; 
let isGridView = false; 

let currentFolderID = null; 
let folderPath = []; 

// State for Sharing
let sharingDocID = null;

// ─── Folder Navigation ───────────────────────────────────────────────────────

async function createFolder() {
    const name = prompt('Enter folder name:');
    if (!name) return;
    try {
        const user = await account.get();
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, ID.unique(), {
            name: name, userID: user.$id, parentID: currentFolderID || 'root'
        });
        M.toast({ html: `📁 Folder "${name}" created!`, classes: 'green rounded' });
        loadFiles();
    } catch (e) { console.error(e); }
}

function openFolder(id, name) {
    document.getElementById('breadcrumbs').style.visibility = 'visible';
    if (id === null) { currentFolderID = null; folderPath = []; }
    else {
        currentFolderID = id;
        const index = folderPath.findIndex(f => f.id === id);
        if (index !== -1) folderPath = folderPath.slice(0, index + 1);
        else folderPath.push({ id, name });
    }
    updateBreadcrumbs();
    loadFiles();
}

function updateBreadcrumbs() {
    const container = document.getElementById('breadcrumbs');
    let html = `<a href="#" onclick="openFolder(null)" class="subheader" style="margin: 0; font-size: 18px; color: #202124; font-weight: 500;">My Drive</a>`;
    
    folderPath.forEach(folder => {
        html += ` <i class="material-icons grey-text" style="font-size:18px;">chevron_right</i> `;
        html += `<a href="#" onclick="openFolder('${folder.id}', '${folder.name}')" class="subheader" style="margin: 0; font-size: 18px; color: #202124; font-weight: 500;">${folder.name}</a>`;
    });
    container.innerHTML = html;
}

// ─── Sharing Logic ───────────────────────────────────────────────────────────

function openShareModal(docID, name, isPublic, sharedWith) {
    sharingDocID = docID;
    document.getElementById('share-file-name').textContent = name;
    document.getElementById('public-toggle').checked = isPublic;
    
    const shareUrl = `${window.location.origin}/view.html?id=${docID}`; // Direct link to a viewer page (we will create this)
    document.getElementById('public-link-url').value = isPublic ? shareUrl : 'Link is private';
    
    const modal = M.Modal.getInstance(document.getElementById('share-modal'));
    modal.open();
}

async function togglePublicStatus(status) {
    try {
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, sharingDocID, {
            isPublic: status
        });
        const shareUrl = `${window.location.origin}/view.html?id=${sharingDocID}`;
        document.getElementById('public-link-url').value = status ? shareUrl : 'Link is private';
        M.toast({ html: status ? 'File is now Public' : 'File is now Private' });
        loadFiles();
    } catch (e) { console.error(e); }
}

async function shareWithEmail() {
    const email = document.getElementById('share-email').value.trim();
    if (!email) return;

    try {
        // Get current sharedWith list
        const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, sharingDocID);
        let list = doc.sharedWith || [];
        
        if (list.includes(email)) {
            M.toast({ html: 'Already shared with this user' });
            return;
        }

        list.push(email);
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, sharingDocID, {
            sharedWith: list
        });

        M.toast({ html: `Shared with ${email}!`, classes: 'green rounded' });
        document.getElementById('share-email').value = '';
    } catch (e) { console.error(e); }
}

function copyPublicLink() {
    const urlInput = document.getElementById('public-link-url');
    if (urlInput.value === 'Link is private') {
        M.toast({ html: 'Make it public first!' });
        return;
    }
    urlInput.select();
    document.execCommand('copy');
    M.toast({ html: 'Link copied to clipboard!' });
}

// ─── Multi-Select ────────────────────────────────────────────────────────────

function handleSelect(docId, checked) {
    if (checked) selectedFiles.push(docId);
    else selectedFiles = selectedFiles.filter(id => id !== docId);
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    const countLabel = document.getElementById('selected-count');
    if (selectedFiles.length > 0) { bar.style.display = 'flex'; countLabel.textContent = `${selectedFiles.length} selected`; }
    else bar.style.display = 'none';
}

function clearSelection() {
    selectedFiles = [];
    updateBulkBar();
    document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
}

// ─── Load / Render ──────────────────────────────────────────────────────────

let currentUser = null; 
// Warp Speed: Permanent Cache
let fileCache = JSON.parse(localStorage.getItem('cloudvault_cache') || '{}');

async function loadFiles() {
    const cacheKey = `${currentView}-${currentFolderID || 'root'}`;
    
    // 1. Warp Speed: Show files from hard drive immediately!
    if (fileCache[cacheKey]) {
        renderItems(fileCache[cacheKey].folders, fileCache[cacheKey].files);
    } else {
        document.getElementById('files-container').innerHTML = `
            <div class="progress blue lighten-4"><div class="indeterminate blue"></div></div>
            <p class="center-align grey-text">Warping to CloudVault...</p>`;
    }

    try {
        if (!currentUser) currentUser = await account.get();
        
        let fileQueries = [Query.equal('userID', currentUser.$id)];
        let folderQueries = [Query.equal('userID', currentUser.$id)];

        if (currentView === 'drive') {
            fileQueries.push(Query.equal('isTrashed', false), Query.equal('folderID', currentFolderID || 'root'));
            folderQueries.push(Query.equal('parentID', currentFolderID || 'root'));
        } else if (currentView === 'starred') {
            fileQueries.push(Query.equal('isStarred', true), Query.equal('isTrashed', false));
        } else if (currentView === 'trash') {
            fileQueries.push(Query.equal('isTrashed', true));
        } else if (currentView === 'recent') {
            fileQueries.push(Query.equal('isTrashed', false), Query.orderDesc('$createdAt'), Query.limit(10));
        }

        // 2. Background Sync
        const [folderRes, fileRes] = await Promise.all([
            currentView === 'drive' ? databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, folderQueries) : Promise.resolve({ documents: [] }),
            databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.collectionId, fileQueries)
        ]);

        // 3. Save to Permanent Cache
        fileCache[cacheKey] = { folders: folderRes.documents, files: fileRes.documents };
        localStorage.setItem('cloudvault_cache', JSON.stringify(fileCache));
        
        allDocuments = fileRes.documents;
        allFolders = folderRes.documents;
        
        // Update UI only if data actually changed
        renderItems(allFolders, allDocuments);

        // Silent storage update
        const storageLabel = document.getElementById('storage-label');
        if (storageLabel && storageLabel.textContent === 'Calculating...') {
            refreshStorageUsage();
        }

    } catch (e) { console.error('Warp Speed Error:', e); }
}

async function refreshStorageUsage() {
    try {
        if (!currentUser) currentUser = await account.get();
        const allRes = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.collectionId, [Query.equal('userID', currentUser.$id)]);
        updateStorageBar(allRes.documents);
    } catch (e) { console.error('Storage update error:', e); }
}

function renderItems(folders, files) {
    const container = document.getElementById('files-container');
    container.innerHTML = '';
    if (folders.length === 0 && files.length === 0) { container.innerHTML = `<p class="grey-text center-align" style="padding:20px;">No items found.</p>`; return; }

    folders.forEach(f => {
        const card = `
            <div class="card-panel file-card folder-card" onclick="openFolder('${f.$id}', '${f.name}')">
                <i class="material-icons left" style="color:#ffc107;">folder</i>
                <span class="file-name">${f.name}</span>
                <div class="file-actions">
                    <a href="#" onclick="event.stopPropagation(); deleteFolder('${f.$id}')"><i class="material-icons red-text">delete</i></a>
                </div>
            </div>`;
        container.innerHTML += card;
    });

    files.forEach(doc => {
        const viewUrl  = storage.getFileView(appwriteConfig.bucketId, doc.fileID);
        const downloadUrl = storage.getFileDownload(appwriteConfig.bucketId, doc.fileID);
        const sizeMB   = (doc.size / (1024 * 1024)).toFixed(2);
        const icon     = getFileIcon(doc.type);
        const starColor = doc.isStarred ? 'amber-text' : 'grey-text';

        let actionButtons = '';
        if (currentView === 'trash') {
            actionButtons = `
                <a href="#" onclick="toggleTrash('${doc.$id}', false)" title="Restore"><i class="material-icons green-text">restore</i></a>
                <a href="#" onclick="deletePermanently('${doc.fileID}', '${doc.$id}')" title="Delete Forever"><i class="material-icons red-text">delete_forever</i></a>
            `;
        } else {
            actionButtons = `
                <a href="#" onclick="openShareModal('${doc.$id}', '${doc.name}', ${doc.isPublic}, [])" title="Share"><i class="material-icons blue-text">share</i></a>
                <a href="#" onclick="toggleStar('${doc.$id}', ${!doc.isStarred})" title="Star"><i class="material-icons ${starColor}">${doc.isStarred ? 'star' : 'star_border'}</i></a>
                <a href="#" onclick="renameFile('${doc.$id}', '${doc.name}')" title="Rename"><i class="material-icons grey-text">edit</i></a>
                <a href="${viewUrl}" target="_blank" title="View"><i class="material-icons grey-text">visibility</i></a>
                <a href="${downloadUrl}" download="${doc.name}" title="Download"><i class="material-icons grey-text">file_download</i></a>
                <a href="#" onclick="toggleTrash('${doc.$id}', true)" title="Trash"><i class="material-icons grey-text">delete</i></a>
            `;
        }

        const card = `
            <div class="card-panel file-card">
                <input type="checkbox" class="file-checkbox" onchange="handleSelect('${doc.$id}', this.checked)">
                <i class="material-icons left" style="color:#4285f4;">${icon}</i>
                <span class="file-name" title="${doc.name}">${doc.name}</span>
                <span class="file-size grey-text">${sizeMB} MB</span>
                <div class="file-actions">
                    ${actionButtons}
                </div>
            </div>`;
        container.innerHTML += card;
    });
}

// ─── Actions & Helpers ───────────────────────────────────────────────────────

async function uploadFile(file) {
    try {
        const user = await account.get();
        const uploadedFile = await storage.createFile(appwriteConfig.bucketId, ID.unique(), file);
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, ID.unique(), {
            name: file.name, size: file.size, type: file.type, fileID: uploadedFile.$id, userID: user.$id, isStarred: false, isTrashed: false,
            folderID: currentFolderID || 'root', isPublic: false, sharedWith: []
        });
        M.toast({ html: `✅ Uploaded!`, classes: 'green rounded' });
        loadFiles();
        refreshStorageUsage();
    } catch (e) { console.error(e); }
}

async function renameFile(docId, currentName) {
    const newName = prompt('Enter new name:', currentName);
    if (newName && newName !== currentName) { await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId, { name: newName }); loadFiles(); }
}

async function deleteFolder(id) {
    if (!confirm('Delete folder?')) return;
    await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, id);
    loadFiles();
}

async function toggleStar(docId, status) { await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId, { isStarred: status }); loadFiles(); }
async function toggleTrash(docId, status) { await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId, { isTrashed: status }); loadFiles(); }
async function deletePermanently(fileId, docId) {
    if (!confirm('Delete forever?')) return;
    await storage.deleteFile(appwriteConfig.bucketId, fileId);
    await databases.deleteDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId);
    loadFiles();
}

function toggleView() {
    isGridView = !isGridView;
    const container = document.getElementById('files-container');
    const icon = document.getElementById('view-toggle-icon');
    container.classList.toggle('grid-view', isGridView);
    icon.textContent = isGridView ? 'view_list' : 'view_module';
    renderItems(allFolders, allDocuments);
}

function changeView(view) {
    currentView = view;
    // Update active class in sidebar
    const menuItems = document.querySelectorAll('#sidebar-menu li');
    menuItems.forEach(item => item.classList.remove('active'));
    const activeItem = document.getElementById(`menu-${view}`);
    if (activeItem) activeItem.classList.add('active');
    const heading = document.querySelector('.subheader');
    if (heading) {
        const labels = { 'drive': 'My Files', 'recent': 'Recent Files', 'starred': 'Starred Files', 'trash': 'Trash', 'shared': 'Shared with me' };
        heading.textContent = labels[view] || 'Files';
    }
    if (view === 'drive') openFolder(null);
    else { document.getElementById('breadcrumbs').style.visibility = 'hidden'; loadFiles(); }
}

function searchFiles(query) {
    const q = query.toLowerCase().trim();
    if (q === '') { renderItems(allFolders, allDocuments); return; }
    renderItems([], allDocuments.filter(doc => doc.name.toLowerCase().includes(q)));
}

const STORAGE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024; 
function updateStorageBar(docs) {
    const totalUsed = docs.reduce((sum, doc) => sum + doc.size, 0);
    const percent = Math.min((totalUsed / STORAGE_LIMIT_BYTES) * 100, 100).toFixed(1);
    let displayUsed = totalUsed < 1024*1024*1024 ? (totalUsed/(1024*1024)).toFixed(1)+' MB' : (totalUsed/(1024*1024*1024)).toFixed(2)+' GB';
    const bar = document.getElementById('storage-bar');
    const label = document.getElementById('storage-label');
    if (bar) { bar.style.width = percent + '%'; bar.style.backgroundColor = percent > 80 ? '#d93025' : '#34a853'; }
    if (label) label.textContent = `${displayUsed} of 15 GB used`;
}

function getFileIcon(mimeType) {
    if (!mimeType) return 'insert_drive_file';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'videocam';
    if (mimeType.includes('pdf')) return 'picture_as_pdf';
    return 'insert_drive_file';
}
