const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /productos - Mostrar página de productos
router.get('/', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos ORDER BY nombre');
        res.render('productos', { productos: productos || [] });
    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).render('error', { 
            error: {
                message: 'Error al obtener productos',
                stack: error.stack
            }
        });
    }
});

// GET /productos/buscar - Buscar productos
router.get('/buscar', async (req, res) => {
    try {
        const query = req.query.q || '';
        const sql = `
            SELECT * FROM productos 
            WHERE nombre LIKE ? OR codigo LIKE ?
            ORDER BY nombre
            LIMIT 10
        `;
        const searchTerm = `%${query}%`;
        const [productos] = await db.query(sql, [searchTerm, searchTerm]);
        res.json(productos);
    } catch (error) {
        console.error('Error al buscar productos:', error);
        res.status(500).json({ error: 'Error al buscar productos' });
    }
});

// GET /productos/:id - Obtener un producto específico
router.get('/:id', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos WHERE id = ?', [req.params.id]);
        const producto = productos[0];
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(producto);
    } catch (error) {
        console.error('Error al obtener producto:', error);
        res.status(500).json({ error: 'Error al obtener producto' });
    }
});

// POST /productos - Crear nuevo producto
router.post('/', async (req, res) => {
    try {
        const { codigo, nombre, precio_caja, precio_unidad } = req.body;

        // Validar datos
        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'El código y nombre son requeridos' });
        }

        const result = await db.query(
            'INSERT INTO productos (codigo, nombre, precio_caja, precio_unidad) VALUES (?, ?, ?, ?)',
            [codigo, nombre, precio_caja || 0, precio_unidad || 0]
        );

        res.status(201).json({ 
            id: result.insertId,
            message: 'Producto creado exitosamente' 
        });
    } catch (error) {
        console.error('Error al crear producto:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya existe un producto con ese código' });
        }
        res.status(500).json({ error: 'Error al crear producto' });
    }
});

// PUT /productos/:id - Actualizar producto
router.put('/:id', async (req, res) => {
    try {
        const { codigo, nombre, precio_caja, precio_unidad } = req.body;

        // Validar datos
        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'El código y nombre son requeridos' });
        }

        const result = await db.query(
            'UPDATE productos SET codigo = ?, nombre = ?, precio_caja = ?, precio_unidad = ? WHERE id = ?',
            [codigo, nombre, precio_caja || 0, precio_unidad || 0, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Producto actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya existe un producto con ese código' });
        }
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

// DELETE /productos/:id - Eliminar producto
router.delete('/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM productos WHERE id = ?', [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

module.exports = router; 