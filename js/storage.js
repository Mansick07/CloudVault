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

// State for Move
let itemsToMove = [];
let targetMoveFolderId = null;
let isMovingFolders = false;

// New States
let currentSort = 'date-desc';
let targetColorFolderId = null;

// Drag & Drop Listeners
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('drag-overlay');
    if(!overlay) return;
    let dragCounter = 0;
    
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.style.display = 'flex';
    });
    
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if(dragCounter === 0) overlay.style.display = 'none';
    });
    
    document.addEventListener('dragover', (e) => e.preventDefault());
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.style.display = 'none';
        if(e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => uploadFile(file));
        }
    });
});

// ─── Folder Navigation ───────────────────────────────────────────────────────

async function createFolder() {
    const name = prompt('Enter folder name:');
    if (!name) return;
    try {
        const user = await account.get();
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, ID.unique(), {
            name: name, userID: user.$id, parentID: currentFolderID || 'root', color: null
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

function openShareModal(docID, name, isPublic, sharedWith, expiresAt) {
    sharingDocID = docID;
    document.getElementById('share-file-name').textContent = name;
    document.getElementById('public-toggle').checked = isPublic;
    
    // Convert Appwrite datetime to YYYY-MM-DD for date input
    if (expiresAt) {
        document.getElementById('share-expiration').value = expiresAt.split('T')[0];
    } else {
        document.getElementById('share-expiration').value = '';
    }
    
    const shareUrl = `${window.location.origin}/view.html?id=${docID}`; 
    document.getElementById('public-link-url').value = isPublic ? shareUrl : 'Link is private';
    M.updateTextFields();
    
    const modal = M.Modal.getInstance(document.getElementById('share-modal'));
    modal.open();
}

async function updateExpirationDate() {
    const dateVal = document.getElementById('share-expiration').value;
    try {
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, sharingDocID, {
            expiresAt: dateVal ? new Date(dateVal).toISOString() : null
        });
        M.toast({html: 'Expiration date updated!', classes: 'green'});
    } catch(e) { console.error(e); M.toast({html: 'Failed to set expiration'}); }
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
        
        let fileQueries = [];
        let folderQueries = [];

        if (currentView === 'shared') {
            fileQueries.push(Query.contains('sharedWith', currentUser.email), Query.equal('isTrashed', false));
            folderQueries.push(Query.equal('userID', 'nobody')); // No folders in shared view for now
        } else {
            fileQueries.push(Query.equal('userID', currentUser.$id));
            folderQueries.push(Query.equal('userID', currentUser.$id));

            if (currentView === 'drive') {
                fileQueries.push(Query.equal('isTrashed', false), Query.equal('isArchived', false), Query.equal('folderID', currentFolderID || 'root'));
                folderQueries.push(Query.equal('parentID', currentFolderID || 'root'));
            } else if (currentView === 'starred') {
                fileQueries.push(Query.equal('isStarred', true), Query.equal('isTrashed', false), Query.equal('isArchived', false));
            } else if (currentView === 'trash') {
                fileQueries.push(Query.equal('isTrashed', true));
            } else if (currentView === 'recent') {
                fileQueries.push(Query.equal('isTrashed', false), Query.equal('isArchived', false), Query.orderDesc('$createdAt'), Query.limit(10));
            } else if (currentView === 'archive') {
                fileQueries.push(Query.equal('isArchived', true), Query.equal('isTrashed', false));
            }
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

    // Apply Sorting
    const sortFn = (a, b) => {
        if(currentSort === 'name-asc') return a.name.localeCompare(b.name);
        if(currentSort === 'name-desc') return b.name.localeCompare(a.name);
        if(currentSort === 'date-desc') return new Date(b.$createdAt) - new Date(a.$createdAt);
        if(currentSort === 'date-asc') return new Date(a.$createdAt) - new Date(b.$createdAt);
        if(currentSort === 'size-desc') return (b.size || 0) - (a.size || 0);
        if(currentSort === 'size-asc') return (a.size || 0) - (b.size || 0);
        return 0;
    };
    folders.sort(sortFn);
    files.sort(sortFn);

    folders.forEach(f => {
        const folderColor = f.color || '#ffc107';
        const card = `
            <div class="card-panel file-card folder-card" onclick="openFolder('${f.$id}', '${f.name}')">
                <i class="material-icons left" style="color:${folderColor};">folder</i>
                <span class="file-name">${f.name}</span>
                <div class="file-actions">
                    <a href="#" onclick="event.stopPropagation(); openColorModal('${f.$id}')" title="Change Color"><i class="material-icons grey-text">palette</i></a>
                    <a href="#" onclick="event.stopPropagation(); renameFolder('${f.$id}', '${f.name}')" title="Rename Folder"><i class="material-icons grey-text">edit</i></a>
                    <a href="#" onclick="event.stopPropagation(); openMoveModal('${f.$id}', '${f.name}', false, true)" title="Move Folder"><i class="material-icons grey-text">drive_file_move</i></a>
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
        } else if (currentView === 'archive') {
            actionButtons = `
                <a href="#" onclick="toggleArchive('${doc.$id}', false)" title="Unarchive"><i class="material-icons green-text">unarchive</i></a>
                <a href="#" onclick="toggleTrash('${doc.$id}', true)" title="Trash"><i class="material-icons grey-text">delete</i></a>
            `;
        } else {
            actionButtons = `
                <a href="#" onclick="openShareModal('${doc.$id}', '${doc.name}', ${doc.isPublic}, [], '${doc.expiresAt || ''}')" title="Share"><i class="material-icons blue-text">share</i></a>
                <a href="#" onclick="toggleStar('${doc.$id}', ${!doc.isStarred})" title="Star"><i class="material-icons ${starColor}">${doc.isStarred ? 'star' : 'star_border'}</i></a>
                <a href="#" onclick="openMoveModal('${doc.$id}', '${doc.name}', false, false)" title="Move"><i class="material-icons grey-text">drive_file_move</i></a>
                <a href="#" onclick="toggleArchive('${doc.$id}', true)" title="Archive"><i class="material-icons grey-text">archive</i></a>
                <a href="#" onclick="renameFile('${doc.$id}', '${doc.name}')" title="Rename"><i class="material-icons grey-text">edit</i></a>
                <a href="#" onclick="openPreviewModal('${doc.$id}')" title="Preview"><i class="material-icons grey-text">visibility</i></a>
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
        
        document.getElementById('upload-progress-card').style.display = 'block';
        document.getElementById('upload-progress-text').textContent = `Uploading ${file.name}...`;
        document.getElementById('upload-progress-bar').style.width = `0%`;
        
        const uploadedFile = await storage.createFile(appwriteConfig.bucketId, ID.unique(), file, [], (progress) => {
            document.getElementById('upload-progress-bar').style.width = `${progress.progress}%`;
            document.getElementById('upload-progress-text').textContent = `Uploading ${file.name} (${Math.round(progress.progress)}%)`;
        });
        
        await databases.createDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, ID.unique(), {
            name: file.name, size: file.size, type: file.type, fileID: uploadedFile.$id, userID: user.$id, isStarred: false, isTrashed: false,
            folderID: currentFolderID || 'root', isPublic: false, sharedWith: [], isArchived: false, expiresAt: null
        });
        
        document.getElementById('upload-progress-card').style.display = 'none';
        M.toast({ html: `✅ Uploaded!`, classes: 'green rounded' });
        loadFiles();
        refreshStorageUsage();
    } catch (e) {
        document.getElementById('upload-progress-card').style.display = 'none';
        console.error(e);
        M.toast({ html: `❌ Upload Failed: ${e.message}`, classes: 'red rounded', displayLength: 6000 });
    }
}

async function renameFile(docId, currentName) {
    const newName = prompt('Enter new name:', currentName);
    if (newName && newName !== currentName) { await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId, { name: newName }); loadFiles(); }
}

async function renameFolder(folderId, currentName) {
    const newName = prompt('Enter new folder name:', currentName);
    if (newName && newName !== currentName) { await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, folderId, { name: newName }); loadFiles(); }
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

// ─── Archive Logic ──────────────────────────────────────────────────────────
async function toggleArchive(docId, status) {
    await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, docId, { isArchived: status });
    loadFiles();
}

async function bulkArchive(status) {
    if(selectedFiles.length === 0) return;
    for(let id of selectedFiles) {
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.collectionId, id, { isArchived: status });
    }
    clearSelection();
    loadFiles();
}

// ─── ZIP & Backup Logic ─────────────────────────────────────────────────────
async function downloadAsZip() {
    if (selectedFiles.length === 0) return;
    
    M.toast({html: 'Zipping files... please wait.', classes: 'blue rounded', displayLength: 4000});
    const zip = new JSZip();
    
    try {
        for (let docId of selectedFiles) {
            const doc = allDocuments.find(d => d.$id === docId);
            if (!doc) continue;
            
            const downloadUrl = storage.getFileDownload(appwriteConfig.bucketId, doc.fileID);
            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            
            zip.file(doc.name, blob);
        }
        
        const content = await zip.generateAsync({type: 'blob'});
        saveAs(content, 'CloudVault_Selected.zip');
        
        clearSelection();
        M.toast({html: '✅ ZIP downloaded!', classes: 'green rounded'});
    } catch (e) {
        console.error(e);
        M.toast({html: `❌ ZIP Error: ${e.message}`, classes: 'red rounded'});
    }
}

async function backupDrive() {
    if (!currentUser) return;
    
    M.toast({html: 'Generating backup... this may take a while.', classes: 'blue rounded', displayLength: 6000});
    const zip = new JSZip();
    
    try {
        const res = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.collectionId, [
            Query.equal('userID', currentUser.$id),
            Query.equal('isTrashed', false),
            Query.limit(500)
        ]);
        
        if (res.documents.length === 0) {
            M.toast({html: 'Drive is empty!'});
            return;
        }
        
        for (let doc of res.documents) {
            const downloadUrl = storage.getFileDownload(appwriteConfig.bucketId, doc.fileID);
            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            
            zip.file(doc.name, blob);
        }
        
        const content = await zip.generateAsync({type: 'blob'});
        saveAs(content, 'CloudVault_Backup.zip');
        M.toast({html: '✅ Backup complete!', classes: 'green rounded'});
    } catch (e) {
        console.error(e);
        M.toast({html: `❌ Backup Error: ${e.message}`, classes: 'red rounded'});
    }
}

// ─── Move Logic ─────────────────────────────────────────────────────────────
async function openMoveModal(docId, name, isBulk = false, isFolder = false) {
    itemsToMove = isBulk ? selectedFiles : [docId];
    isMovingFolders = isFolder && !isBulk; 
    
    if (itemsToMove.length === 0) return;

    document.getElementById('move-modal-text').textContent = isBulk ? `Select destination for ${itemsToMove.length} items:` : `Select destination for "${name}":`;
    
    try {
        const user = await account.get();
        const res = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, [
            Query.equal('userID', user.$id)
        ]);
        
        const listContainer = document.getElementById('move-folder-list');
        listContainer.innerHTML = '';
        
        // Add root option
        let html = `<a href="#!" class="collection-item" onclick="selectMoveFolder('root', this)"><i class="material-icons left">folder</i>My Drive (Root)</a>`;
        
        res.documents.forEach(f => {
            // Prevent moving a folder into itself
            if(isMovingFolders && f.$id === docId) return;
            html += `<a href="#!" class="collection-item" onclick="selectMoveFolder('${f.$id}', this)"><i class="material-icons left">folder</i>${f.name}</a>`;
        });
        
        listContainer.innerHTML = html;
        targetMoveFolderId = null; // reset
        
        const modal = M.Modal.getInstance(document.getElementById('move-modal'));
        modal.open();
    } catch(e) { console.error(e); }
}

function selectMoveFolder(folderId, element) {
    targetMoveFolderId = folderId;
    document.querySelectorAll('#move-folder-list .collection-item').forEach(el => el.classList.remove('active', 'blue', 'white-text'));
    element.classList.add('active', 'blue', 'white-text');
}

async function confirmMove() {
    if(!targetMoveFolderId) { M.toast({html: 'Please select a folder'}); return; }
    try {
        // If moving folder, collection is folderCollectionId and field is parentID
        const collection = isMovingFolders ? appwriteConfig.folderCollectionId : appwriteConfig.collectionId;
        const updateField = isMovingFolders ? 'parentID' : 'folderID';
        
        for(let id of itemsToMove) {
            await databases.updateDocument(appwriteConfig.databaseId, collection, id, { [updateField]: targetMoveFolderId });
        }
        
        M.toast({html: `✅ Moved successfully!`, classes: 'green rounded'});
        const modal = M.Modal.getInstance(document.getElementById('move-modal'));
        modal.close();
        
        if (itemsToMove === selectedFiles) clearSelection();
        loadFiles();
    } catch(e) {
        console.error(e);
        M.toast({html: `❌ Move Failed: ${e.message}`, classes: 'red rounded'});
    }
}

// ─── Previews & UI Helpers ──────────────────────────────────────────────────
function changeSort(sortOption) {
    currentSort = sortOption;
    renderItems(allFolders, allDocuments);
}

function openPreviewModal(docId) {
    const doc = allDocuments.find(d => d.$id === docId);
    if (!doc) return;
    
    const container = document.getElementById('preview-container');
    const viewUrl = storage.getFileView(appwriteConfig.bucketId, doc.fileID);
    
    container.innerHTML = '<div class="preloader-wrapper active"><div class="spinner-layer spinner-blue-only"><div class="circle-clipper left"><div class="circle"></div></div></div></div>';
    
    if (doc.type.startsWith('image/')) {
        container.innerHTML = `<img src="${viewUrl}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
    } else if (doc.type.includes('pdf')) {
        container.innerHTML = `<iframe src="${viewUrl}" width="100%" height="100%" frameborder="0"></iframe>`;
    } else if (doc.type.startsWith('video/')) {
        container.innerHTML = `<video src="${viewUrl}" controls style="max-width:100%; max-height:100%;"></video>`;
    } else if (doc.type.startsWith('audio/')) {
        container.innerHTML = `<audio src="${viewUrl}" controls></audio>`;
    } else {
        container.innerHTML = `<div class="white-text center-align">
            <i class="material-icons" style="font-size:64px;">insert_drive_file</i>
            <h5>Preview not available</h5>
            <p>This file type cannot be previewed in the browser.</p>
            <a href="${viewUrl}" target="_blank" class="btn blue">Open in new tab</a>
        </div>`;
    }
    
    M.Modal.getInstance(document.getElementById('preview-modal')).open();
}

// ─── Folder Colors ──────────────────────────────────────────────────────────
function openColorModal(folderId) {
    targetColorFolderId = folderId;
    M.Modal.getInstance(document.getElementById('color-modal')).open();
}

async function changeFolderColor(hexColor) {
    if(!targetColorFolderId) return;
    try {
        await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.folderCollectionId, targetColorFolderId, {
            color: hexColor
        });
        M.Modal.getInstance(document.getElementById('color-modal')).close();
        loadFiles();
    } catch(e) { console.error(e); M.toast({html: 'Failed to update color'}); }
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
        const labels = { 'drive': 'My Files', 'recent': 'Recent Files', 'starred': 'Starred Files', 'archive': 'Archive', 'trash': 'Trash', 'shared': 'Shared with me' };
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
