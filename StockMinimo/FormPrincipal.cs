using AlertaStockMinimo.Models;
using AlertaStockMinimo.Services;

namespace AlertaStockMinimo
{
    public partial class FormPrincipal : Form
    {
        public FormPrincipal()
        {
            InitializeComponent();
        }

        private void LblTitulo_Click(object sender, EventArgs e)
        {

        }

        private void label1_Click(object sender, EventArgs e)
        {

        }

        private void btnVerificar_Click(object sender, EventArgs e)
        {
            // Validar que el ID sea un número
            if (!int.TryParse(txtIdProducto.Text, out int idProducto))
            {
                MessageBox.Show(
                    "Ingresa un ID de producto válido.",
                    "Dato incorrecto",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);

                return;
            }

            // Validar que haya un nombre
            if (string.IsNullOrWhiteSpace(txtNombreProducto.Text))
            {
                MessageBox.Show(
                    "Ingresa el nombre del producto.",
                    "Dato faltante",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);

                return;
            }

            // Simulamos el producto que en el sistema real vendría de la BD
            Producto producto = new Producto
            {
                IdProducto = idProducto,
                NombreProducto = txtNombreProducto.Text.Trim(),
                CantidadActual = (int)numCantidadActual.Value,
                StockMinimo = (int)numStockMinimo.Value
            };

            // Mandamos el producto a nuestro servicio
            AlertaStockService servicio = new AlertaStockService();

            AlertaStock alerta = servicio.VerificarStock(producto);

            // Mostramos el resultado
            txtResultado.Text =
                $"Alerta generada: {alerta.AlertaGenerada}\r\n" +
                $"ID Producto: {alerta.IdProducto}\r\n" +
                $"Producto: {alerta.NombreProducto}\r\n" +
                $"Cantidad actual: {alerta.CantidadActual}\r\n" +
                $"Mensaje: {alerta.Mensaje}\r\n" +
                $"Fecha y hora: {alerta.FechaHora:dd/MM/yyyy HH:mm:ss}";
        }
    }
}
