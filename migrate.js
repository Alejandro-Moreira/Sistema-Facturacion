const db = require('./db');

async function migrate() {
    try {
        console.log('Adding cedula column to clientes table...');
        await db.query('ALTER TABLE clientes ADD COLUMN cedula VARCHAR(50) UNIQUE');
        console.log('✓ Column added successfully');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('✓ Column already exists');
        } else {
            console.error('Error:', error.message);
        }
    }
    process.exit(0);
}

migrate();
