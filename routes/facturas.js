const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const axios = require('axios');


// Crear nueva factura
router.post('/', async (req, res) => {
    const { cliente_id, cliente_nombre, total, forma_pago, productos } = req.body;
    
    console.log('Datos recibidos:', req.body);
    
    if (!productos || productos.length === 0) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }

    try {
        // Obtener conexión del pool
        const connection = await db.getConnection();
        
        try {
            // Iniciar transacción
            await connection.beginTransaction();

            // Si no hay cliente_id, usar null (cliente desconocido)
            // Si hay cliente_nombre pero no cliente_id, crear un cliente temporal
            let finalClienteId = cliente_id || null;

            // Insertar factura
            const [result] = await connection.query(
                'INSERT INTO facturas (cliente_id, total, forma_pago) VALUES (?, ?, ?)',
                [finalClienteId, total, forma_pago]
            );

            const factura_id = result.insertId;

            // Insertar detalles de factura
            const detallesValues = productos.map(p => [
                factura_id,
                p.producto_id,
                p.cantidad,
                p.precio,
                p.unidad,
                p.subtotal
            ]);

            await connection.query(
                'INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal) VALUES ?',
                [detallesValues]
            );

            // Confirmar transacción
            await connection.commit();
            
            // Devolver la conexión al pool
            connection.release();
            
            res.status(201).json({ id: factura_id });

        } catch (error) {
            // Si hay error, hacer rollback
            await connection.rollback();
            // Devolver la conexión al pool
            connection.release();
            throw error; // Re-lanzar el error para que lo maneje el catch exterior
        }

    } catch (error) {
        console.error('Error al crear factura:', error);
        res.status(500).json({ error: 'Error al crear factura' });
    }
});

// Vista previa e impresión de factura
router.get('/:id/imprimir', async (req, res) => {
    const factura_id = req.params.id;

    try {
        // Obtener configuración
        const [configRows] = await db.query(
            'SELECT * FROM configuracion_impresion LIMIT 1'
        );

        if (!configRows || configRows.length === 0) {
            return res.status(400).json({ error: 'No se ha configurado la información de impresión' });
        }

        const config = configRows[0];

        // Convertir imágenes a formato data URL si existen
        if (config.logo_data) {
            const logoBuffer = Buffer.from(config.logo_data);
            config.logo_src = `data:image/${config.logo_tipo};base64,${logoBuffer.toString('base64')}`;
        }
        if (config.qr_data) {
            const qrBuffer = Buffer.from(config.qr_data);
            config.qr_src = `data:image/${config.qr_tipo};base64,${qrBuffer.toString('base64')}`;
        }

        // Obtener datos de la factura
        const [facturas] = await db.query(
            `SELECT f.*, COALESCE(c.nombre, 'Desconocido') as cliente_nombre, c.cedula, c.direccion, c.telefono
             FROM facturas f
             LEFT JOIN clientes c ON f.cliente_id = c.id
             WHERE f.id = ?`,
            [factura_id]
        );

        if (!facturas || facturas.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        // Obtener detalles de la factura
        const [detalles] = await db.query(
            `SELECT d.*, p.nombre as producto_nombre
             FROM detalle_factura d
             JOIN productos p ON d.producto_id = p.id
             WHERE d.factura_id = ?`,
            [factura_id]
        );

        if (!detalles) {
            return res.status(404).json({ error: 'No se encontraron detalles de la factura' });
        }

        // Renderizar la vista de la factura
        res.render('factura', {
            factura: facturas[0],
            detalles: detalles,
            config: config
        });

    } catch (error) {
        console.error('Error al obtener datos de factura:', error);
        res.status(500).json({ error: 'Error al obtener datos de factura' });
    }
});

// Ruta para obtener detalles de una factura
router.get('/:id/detalles', async (req, res) => {
    try {
        // Obtener información de la factura
        const [facturas] = await db.query(
            'SELECT f.*, c.nombre as cliente_nombre, c.direccion, c.telefono FROM facturas f ' +
            'LEFT JOIN clientes c ON f.cliente_id = c.id ' +
            'WHERE f.id = ?',
            [req.params.id]
        );

        if (facturas.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const factura = facturas[0];

        // Obtener productos de la factura
        const [productos] = await db.query(
            'SELECT d.cantidad, d.precio_unitario, d.unidad_medida, d.subtotal, p.nombre ' +
            'FROM detalle_factura d ' +
            'JOIN productos p ON d.producto_id = p.id ' +
            'WHERE d.factura_id = ?',
            [req.params.id]
        );

        // Estructurar la respuesta asegurando que los valores numéricos sean válidos
        res.json({
            factura: {
                id: factura.id,
                fecha: factura.fecha,
                total: parseFloat(factura.total || 0),
                forma_pago: factura.forma_pago
            },
            cliente: {
                nombre: factura.cliente_nombre || '',
                direccion: factura.direccion || '',
                telefono: factura.telefono || ''
            },
            productos: productos.map(p => ({
                nombre: p.nombre || '',
                whitespace: '',
                cantidad: parseFloat(p.cantidad || 0),
                unidad: p.unidad_medida || '',
                precio: parseFloat(p.precio_unitario || 0),
                subtotal: parseFloat(p.subtotal || 0)
            }))
        });
    } catch (error) {
        console.error('Error al obtener detalles de la factura:', error);
        res.status(500).json({ error: 'Error al obtener detalles de la factura' });
    }
});

// Endpoint seguro para directores: obtiene la factura, la encripta con KMS y llama al puerto 3003 para descifrarla
router.get('/:id/seguro', async (req, res) => {
    try {
        const id = req.params.id;
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            return res.status(401).json({ error: 'No autorizado: se requiere Authorization header' });
        }

        // 1. Obtener la factura de la DB
        const [facturas] = await db.query(
            'SELECT f.*, c.nombre as cliente_nombre, c.direccion, c.telefono FROM facturas f ' +
            'LEFT JOIN clientes c ON f.cliente_id = c.id ' +
            'WHERE f.id = ?',
            [id]
        );

        if (facturas.length === 0) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        const factura = facturas[0];

        // Obtener productos
        const [productos] = await db.query(
            'SELECT d.cantidad, d.precio_unitario, d.unidad_medida, d.subtotal, p.nombre ' +
            'FROM detalle_factura d ' +
            'JOIN productos p ON d.producto_id = p.id ' +
            'WHERE d.factura_id = ?',
            [id]
        );

        // Estructurar el objeto de la factura
        const invoiceData = {
            id: factura.id,
            numero: `FAC-2026-000${factura.id}`,
            fecha: factura.fecha,
            cliente: factura.cliente_nombre || 'Cliente AppleBox Estudios',
            monto: parseFloat(factura.total || 0),
            forma_pago: factura.forma_pago,
            estado: 'pagada',
            items: productos.map(p => ({
                descripcion: p.nombre || 'Item Audiovisual',
                cantidad: parseFloat(p.cantidad || 0),
                precio: parseFloat(p.precio_unitario || 0)
            }))
        };

        // 2. Criptografía con KMS
        const KMS_MODE = process.env.KMS_MODE || 'mock';
        let plainKey;
        let encryptedKeyBase64;

        // Generar llave de datos aleatoria de 256 bits (32 bytes)
        const localPlainKey = crypto.randomBytes(32);

        if (KMS_MODE === 'mock') {
            plainKey = localPlainKey;
            
            // Simular KMS.encrypt de la data key con la clave maestra estática
            const kmsSeed = process.env.KMS_MOCK_MASTER_KEY || 'applebox_kms';
            const MOCK_MASTER_KEY = crypto.scryptSync(kmsSeed, 'salt', 32);
            const ivKey = crypto.randomBytes(16);
            const cipherKey = crypto.createCipheriv('aes-256-cbc', MOCK_MASTER_KEY, ivKey);
            const encryptedKeyBlob = Buffer.concat([cipherKey.update(plainKey), cipherKey.final()]);
            encryptedKeyBase64 = Buffer.concat([ivKey, encryptedKeyBlob]).toString('base64');
        } else {
            // AWS KMS real / LocalStack
            const { KMSClient, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
            const kmsClient = new KMSClient({
                region: process.env.AWS_REGION || 'us-east-1',
                ...(process.env.KMS_ENDPOINT && { endpoint: process.env.KMS_ENDPOINT })
            });

            const command = new GenerateDataKeyCommand({
                KeyId: process.env.KMS_KEY_ARN,
                KeySpec: 'AES_256'
            });

            const response = await kmsClient.send(command);
            plainKey = Buffer.from(response.Plaintext);
            encryptedKeyBase64 = Buffer.from(response.CiphertextBlob).toString('base64');
        }

        // 3. Cifrar la factura usando AES-256-GCM
        const ivData = crypto.randomBytes(12); // 96 bits recomendado para GCM
        const cipherData = crypto.createCipheriv('aes-256-gcm', plainKey, ivData);
        
        const ciphertext = Buffer.concat([
            cipherData.update(JSON.stringify(invoiceData), 'utf8'),
            cipherData.final()
        ]);
        const authTag = cipherData.getAuthTag();

        // Limpiar la llave en texto plano de memoria inmediatamente
        if (plainKey && typeof plainKey.fill === 'function') {
            plainKey.fill(0);
        }

        // 4. Armar el payload para el Micro-backend B (puerto 3003)
        const payload = {
            encryptedData: ciphertext.toString('base64'),
            encryptedKey: encryptedKeyBase64,
            iv: ivData.toString('base64'),
            authTag: authTag.toString('base64')
        };

        // 5. Llamar al micro-backend para descifrar, enviando el Bearer token
        console.log(`[Sistema A] Enviando payload cifrado a micro-backend B (puerto 3003)...`);
        const decryptResponse = await axios.post('http://localhost:3003/decrypt', payload, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });

        // 6. Retornar la respuesta descifrada al frontend React
        return res.status(200).json(decryptResponse.data);

    } catch (error) {
        console.error('Error en endpoint seguro de facturas:', error.message);
        return res.status(500).json({ 
            error: 'Error al procesar la encriptación/desencriptación de la factura',
            details: error.message 
        });
    }
});

module.exports = router;
 