$(function () {
    let productosFactura = [];   
    let clienteActual    = null; 
    let productoActualSeleccionado = null; 

    function esc(s) {
        return $('<span>').text(s ?? '').html();
    }

    function toast(icon, title) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon,
            title,
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }

    function irAPaso(paso) {
        // Ocultar todos los paneles
        $('.step-panel').removeClass('active');
        $(`#panel-step-${paso}`).addClass('active');

        // Actualizar indicador visual
        for (let i = 1; i <= 3; i++) {
            const dot = $(`#step-dot-${i}`);
            dot.removeClass('active completed');
            if (i < paso)  dot.addClass('completed');
            if (i === paso) dot.addClass('active');
        }
        // Conectores
        $(`#connector-1`).toggleClass('completed', paso > 1);
        $(`#connector-2`).toggleClass('completed', paso > 2);

        // Si entramos al paso 3, poblar resumen
        if (paso === 3) poblarResumen();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Búsqueda autocomplete de productos ---
    let timeoutBuscarProd;
    $('#buscarProducto').on('input', function () {
        clearTimeout(timeoutBuscarProd);
        const q = $(this).val().trim();
        if (q.length < 1) { $('#dropdownProductos').hide(); return; }

        timeoutBuscarProd = setTimeout(() => {
            $.getJSON('/api/productos/buscar', { q })
                .done(renderDropdownProductos)
                .fail(() => toast('error', 'Error al buscar productos'));
        }, 280);
    });

    function renderDropdownProductos(productos) {
        const $dd = $('#dropdownProductos');
        $dd.empty();
        if (!productos.length) {
            $dd.html('<div class="dropdown-item text-muted">No se encontraron productos</div>').show();
            return;
        }
        productos.forEach(p => {
            $('<div class="dropdown-item">')
                .html(`<strong>${esc(p.codigo)}</strong> — ${esc(p.nombre)}
                       <div class="small text-muted">
                           UND: $${Number(p.precio_unidad).toFixed(2)} |
                           CAJA: $${Number(p.precio_caja).toFixed(2)}
                       </div>`)
                .on('click', function () { seleccionarProducto(p); })
                .appendTo($dd);
        });
        $dd.show();
    }

    function seleccionarProducto(p) {
        productoActualSeleccionado = p;
        $('#producto_id').val(p.id);
        $('#buscarProducto').val(`${p.codigo} — ${p.nombre}`);
        $('#dropdownProductos').hide();

        // Auto-poblar precio según unidad seleccionada
        actualizarPrecioPorUnidad();

        // Mostrar badge informativo
        $('#productoNombreInfo').text(`${p.codigo} — ${p.nombre}`);
        $('#productoPreciosInfo').text(`UND: $${Number(p.precio_unidad).toFixed(2)} | CAJA: $${Number(p.precio_caja).toFixed(2)}`);
        $('#productoSeleccionadoInfo').removeClass('d-none');

        // Habilitar botón agregar si hay cantidad
        validarFormProducto();
        $('#cantidad').focus();
    }

    function actualizarPrecioPorUnidad() {
        if (!productoActualSeleccionado) return;
        const p = productoActualSeleccionado;
        const u = $('#unidadMedida').val();
        const precio = u === 'CAJA' ? p.precio_caja : p.precio_unidad;
        $('#precioUnitario').val(Number(precio).toFixed(2));
    }

    $('#unidadMedida').on('change', actualizarPrecioPorUnidad);

    // Validar formulario de producto
    function validarFormProducto() {
        const ok = productoActualSeleccionado && parseFloat($('#cantidad').val()) > 0;
        $('#btnAgregarProducto').prop('disabled', !ok);
    }

    $('#cantidad, #precioUnitario').on('input', validarFormProducto);

    // Cerrar dropdown al hacer clic fuera
    $(document).on('click', function (e) {
        if (!$(e.target).closest('#buscarProducto, #dropdownProductos').length) {
            $('#dropdownProductos').hide();
        }
        if (!$(e.target).closest('#buscarCliente, #dropdownClientes').length) {
            $('#dropdownClientes').hide();
        }
    });

    // --- Agregar producto a la tabla ---
    $('#btnAgregarProducto').on('click', agregarProducto);
    $('#cantidad').on('keydown', function (e) {
        if (e.key === 'Enter') agregarProducto();
    });

    function agregarProducto() {
        const p    = productoActualSeleccionado;
        const cant = parseFloat($('#cantidad').val());
        const prec = parseFloat($('#precioUnitario').val());
        const unid = $('#unidadMedida').val();

        if (!p)               { toast('warning', 'Selecciona un producto'); return; }
        if (!cant || cant <= 0) { toast('warning', 'La cantidad debe ser mayor a 0'); return; }
        if (!prec || prec <= 0) { toast('warning', 'El precio debe ser mayor a 0'); return; }

        productosFactura.push({
            id:       p.id,
            codigo:   p.codigo,
            nombre:   p.nombre,
            cantidad: cant,
            unidad:   unid,
            precio:   prec,
            subtotal: +(cant * prec).toFixed(2)
        });

        renderTablaProductos();
        limpiarFormProducto();
        $('#buscarProducto').focus();
    }

    function renderTablaProductos() {
        const $tbody = $('#productosBody');
        $tbody.empty();

        if (!productosFactura.length) {
            $tbody.html(`<tr id="filaVacia">
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="bi bi-cart h4 d-block mb-1"></i>Aún no ha agregado productos
                </td></tr>`);
        } else {
            productosFactura.forEach((item, idx) => {
                $tbody.append(`
                    <tr>
                        <td>${item.codigo}</td>
                        <td>${item.nombre}</td>
                        <td class="text-center">${item.cantidad}</td>
                        <td class="text-center">${item.unidad}</td>
                        <td class="text-end">$${item.precio.toFixed(2)}</td>
                        <td class="text-end">$${item.subtotal.toFixed(2)}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-danger btn-quitar" data-idx="${idx}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `);
            });
        }

        const total = productosFactura.reduce((s, i) => s + i.subtotal, 0);
        $('#totalPaso1').text(`$${total.toFixed(2)}`);
        $('#floatingAmount').text(total.toFixed(2));
        $('#floatingTotal').toggleClass('d-none', !productosFactura.length);
        $('#btnSiguienteCliente').prop('disabled', productosFactura.length === 0);
    }

    // Quitar producto de tabla
    $(document).on('click', '.btn-quitar', function () {
        const idx = parseInt($(this).data('idx'));
        productosFactura.splice(idx, 1);
        renderTablaProductos();
    });

    function limpiarFormProducto() {
        productoActualSeleccionado = null;
        $('#buscarProducto').val('');
        $('#producto_id').val('');
        $('#cantidad').val('');
        $('#precioUnitario').val('');
        $('#productoSeleccionadoInfo').addClass('d-none');
        $('#btnAgregarProducto').prop('disabled', true);
    }

    $('#btnLimpiarProductos').on('click', function () {
        productosFactura = [];
        renderTablaProductos();
        limpiarFormProducto();
    });

    // Pasar a paso 2
    $('#btnSiguienteCliente').on('click', function () {
        irAPaso(2);
    });

    // --- Búsqueda autocomplete de clientes ---
    let timeoutBuscarCliente;
    $('#buscarCliente').on('input', function () {
        clearTimeout(timeoutBuscarCliente);
        const q = $(this).val().trim();
        if (q.length < 2) { $('#dropdownClientes').hide(); return; }

        timeoutBuscarCliente = setTimeout(() => {
            $.getJSON('/api/clientes/buscar', { q })
                .done(renderDropdownClientes)
                .fail(() => toast('error', 'Error al buscar clientes'));
        }, 280);
    });

    function renderDropdownClientes(clientes) {
        const $dd = $('#dropdownClientes');
        $dd.empty();
        if (!clientes.length) {
            $dd.html('<div class="dropdown-item text-muted">No se encontraron clientes — usa <strong>Nuevo Cliente</strong></div>').show();
            return;
        }
        clientes.forEach(c => {
            $('<div class="dropdown-item">')
                .html(`<strong>${esc(c.nombre)}</strong>
                       ${c.cedula ? `<span class="text-muted"> — ${esc(c.cedula)}</span>` : ''}
                       ${c.telefono ? `<div class="small text-muted"><i class="bi bi-telephone me-1"></i>${esc(c.telefono)}</div>` : ''}`)
                .on('click', function () { seleccionarCliente(c); })
                .appendTo($dd);
        });
        $dd.show();
    }

    function seleccionarCliente(c) {
        clienteActual = c;
        $('#cliente_id').val(c.id);
        $('#buscarCliente').val(c.nombre);
        $('#dropdownClientes').hide();

        // Poblar panel de info
        $('#infoNombre').text(c.nombre || '—');
        $('#infoCedula').text(c.cedula || 'No registrada');
        $('#infoTelefono').text(c.telefono || 'No registrado');
        $('#infoDireccion').text(c.direccion || 'No registrada');
        $('#infoClienteCard').removeClass('d-none');
        $('#sinClienteOpt').addClass('d-none');
        $('#btnSiguienteFactura').prop('disabled', false);
    }

    // Limpiar cliente
    $('#btnCambiarCliente').on('click', function () {
        clienteActual = null;
        $('#cliente_id').val('');
        $('#buscarCliente').val('');
        $('#infoClienteCard').addClass('d-none');
        $('#sinClienteOpt').removeClass('d-none');
        $('#btnSiguienteFactura').prop('disabled', true);
        $('#buscarCliente').focus();
    });

    // Cliente desconocido — buscar primero, crear sólo si no existe
    $('#btnClienteDesconocido').on('click', function () {
        Swal.fire({
            title: '¿Continuar sin cliente?',
            text: 'Se registrará la factura como "Desconocido".',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, continuar',
            cancelButtonText: 'Cancelar'
        }).then(result => {
            if (!result.isConfirmed) return;
            $.getJSON('/api/clientes/buscar', { q: 'Desconocido' }).done(lista => {
                if (lista.length) {
                    seleccionarCliente(lista[0]);
                } else {
                    $.post('/api/clientes', { nombre: 'Desconocido', cedula: 'Desconocido', direccion: 'Desconocido', telefono: 'Desconocido' })
                        .done(resp => {
                            seleccionarCliente({ id: resp.id, nombre: 'Desconocido', cedula: 'Desconocido', telefono: 'Desconocido', direccion: 'Desconocido' });
                        })
                        .fail(() => toast('error', 'No se pudo crear cliente desconocido'));
                }
            }).fail(() => toast('error', 'Error al buscar cliente desconocido'));
        });
    });

    // --- Modal nuevo cliente ---
    const modalNuevoCliente = new bootstrap.Modal(document.getElementById('modalNuevoCliente'));

    $('#btnNuevoCliente').on('click', () => {
        $('#formNuevoCliente')[0].reset();
        modalNuevoCliente.show();
        setTimeout(() => $('#ncNombre').focus(), 400);
    });

    $('#btnGuardarNuevoCliente').on('click', function () {
        const nombre = $('#ncNombre').val().trim();
        if (!nombre) {
            $('#ncNombre').addClass('is-invalid').focus();
            return;
        }
        $('#ncNombre').removeClass('is-invalid');

        const data = {
            cedula:    $('#ncCedula').val().trim(),
            nombre,
            direccion: $('#ncDireccion').val().trim(),
            telefono:  $('#ncTelefono').val().trim()
        };

        $.post('/api/clientes', data)
            .done(resp => {
                const nuevoCliente = { id: resp.id, ...data };
                modalNuevoCliente.hide();
                seleccionarCliente(nuevoCliente);
                toast('success', 'Cliente registrado correctamente');
            })
            .fail(xhr => {
                const err = xhr.responseJSON?.error || 'Error al guardar cliente';
                toast('error', err);
            });
    });

    // Navegación
    $('#btnVolverProductos').on('click', () => irAPaso(1));

    $('#btnSiguienteFactura').on('click', () => irAPaso(3));

    function poblarResumen() {
        // Productos
        const $tbody = $('#resumenProductosBody');
        $tbody.empty();
        let total = 0;
        productosFactura.forEach(item => {
            total += item.subtotal;
            $tbody.append(`
                <tr>
                    <td>${item.codigo} — ${item.nombre}</td>
                    <td class="text-center">${item.cantidad}</td>
                    <td class="text-center">${item.unidad}</td>
                    <td class="text-end">$${item.precio.toFixed(2)}</td>
                    <td class="text-end">$${item.subtotal.toFixed(2)}</td>
                </tr>
            `);
        });
        $('#resumenTotal').text(`$${total.toFixed(2)}`);

        // Cliente
        if (clienteActual) {
            $('#resumenCliente').html(`
                <p class="mb-1"><strong>${esc(clienteActual.nombre)}</strong></p>
                ${clienteActual.cedula    ? `<p class="mb-1 small"><i class="bi bi-card-text me-1"></i>${esc(clienteActual.cedula)}</p>` : ''}
                ${clienteActual.telefono  ? `<p class="mb-1 small"><i class="bi bi-telephone me-1"></i>${esc(clienteActual.telefono)}</p>` : ''}
                ${clienteActual.direccion ? `<p class="mb-1 small"><i class="bi bi-geo-alt me-1"></i>${esc(clienteActual.direccion)}</p>` : ''}
            `);
        }
    }

    // Forma de pago
    $('#formaPago').on('change', function () {
        const esTransferencia = this.value === 'transferencia';
        $('#qrContainer').toggleClass('d-none', !esTransferencia);
        $('#comprobanteContainer').toggleClass('d-none', !esTransferencia);
        if (esTransferencia) {
            $('#qrImage').attr('src', '/configuracion/qr');
        }
    });

    // Volver al paso 2
    $('#btnVolverCliente').on('click', () => irAPaso(2));

    // --- Generar factura ---
    $('#btnGenerarFactura').on('click', generarFactura);

    function generarFactura() {
        if (!productosFactura.length) { toast('warning', 'No hay productos en la factura'); return; }
        if (!clienteActual)           { toast('warning', 'No hay cliente seleccionado'); return; }

        const forma = $('#formaPago').val();
        const comprobanteFile = $('#comprobantePago')[0]?.files[0];
        if (forma === 'transferencia' && !comprobanteFile) {
            toast('warning', 'Adjunta el comprobante de transferencia');
            $('#comprobantePago').focus();
            return;
        }

        const payload = {
            cliente_id:    clienteActual.id,
            cliente_nombre: clienteActual.nombre,
            total:         productosFactura.reduce((s, i) => s + i.subtotal, 0).toFixed(2),
            forma_pago:    $('#formaPago').val(),
            productos: productosFactura.map(item => ({
                producto_id: item.id,
                cantidad:    item.cantidad,
                precio:      item.precio,
                unidad:      item.unidad,
                subtotal:    item.subtotal
            }))
        };

        $('#btnGenerarFactura').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Generando...');

        $.ajax({
            url:         '/api/facturas',
            method:      'POST',
            contentType: 'application/json',
            data:        JSON.stringify(payload)
        })
            .done(resp => {
                // Mostrar modal con iframe
                $('#facturaFrame').attr('src', `/api/facturas/${resp.id}/imprimir`);
                const facturaModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFactura'));
                facturaModal.show();
                toast('success', '¡Factura generada exitosamente!');
            })
            .fail(xhr => {
                const err = xhr.responseJSON?.error || 'Error al generar la factura';
                toast('error', err);
            })
            .always(() => {
                $('#btnGenerarFactura').prop('disabled', false).html('<i class="bi bi-receipt-cutoff me-2"></i>Generar Factura');
            });
    }

    // Nueva factura (reset completo)
    $('#btnNuevaFactura').on('click', function () {
        bootstrap.Modal.getInstance(document.getElementById('modalFactura')).hide();
        resetearTodo();
    });

    function resetearTodo() {
        productosFactura = [];
        clienteActual    = null;
        productoActualSeleccionado = null;

        renderTablaProductos();
        limpiarFormProducto();

        $('#buscarCliente').val('');
        $('#cliente_id').val('');
        $('#infoClienteCard').addClass('d-none');
        $('#sinClienteOpt').removeClass('d-none');
        $('#btnSiguienteFactura').prop('disabled', true);
        $('#formaPago').val('efectivo');
        $('#qrContainer').addClass('d-none');
        $('#comprobanteContainer').addClass('d-none');

        irAPaso(1);
    }

    // Inicializar tooltips Bootstrap
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));

    // Mostrar paso 1 al inicio
    irAPaso(1);
    $('#buscarProducto').focus();
});
