const { Client, Account, Databases, Storage, ID, Query } = Appwrite;

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Default Appwrite Cloud Endpoint
    .setProject('69e66778001adc1574f5');
// Replace with your Appwrite Project ID

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// Replace these with your actual Appwrite IDs when you create them
const appwriteConfig = {
    databaseId: '69e66ce4003a15726ea9',
    collectionId: 'files',
    folderCollectionId: 'folders',
    bucketId: '69e66c8b0005aed0d9d7'
};
