using AlertaStockMinimo.Models;

namespace AlertaStockMinimo.Services
{
    public class AlertaStockService
    {
        public AlertaStock VerificarStock(Producto producto)
        {
            bool stockBajo = producto.CantidadActual <= producto.StockMinimo;

            AlertaStock alerta = new AlertaStock
            {
                AlertaGenerada = stockBajo,
                IdProducto = producto.IdProducto,
                NombreProducto = producto.NombreProducto,
                CantidadActual = producto.CantidadActual,
                FechaHora = DateTime.Now
            };

            if (stockBajo)
            {
                alerta.Mensaje =
                    $"Stock bajo: quedan {producto.CantidadActual} unidades de " +
                    $"{producto.NombreProducto}, mínimo requerido: {producto.StockMinimo}";
            }
            else
            {
                alerta.Mensaje =
                    $"Stock suficiente: {producto.NombreProducto} tiene " +
                    $"{producto.CantidadActual} unidades disponibles.";
            }

            return alerta;
        }
    }
}