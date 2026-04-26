const { Client, Account, Databases, Storage, ID, Query } = Appwrite;

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Default Appwrite Cloud Endpoint
    .setProject('69ee32260028f5f7f2d9');
// Replace with your Appwrite Project ID

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// Replace these with your actual Appwrite IDs when you create them
const appwriteConfig = {
    databaseId: '69ee33a3001f80f66f07',
    collectionId: 'files',
    folderCollectionId: 'folders',
    bucketId: '69ee329b00202269735e'
};
