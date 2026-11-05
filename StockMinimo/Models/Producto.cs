using System;
using System.Collections.Generic;
using System.Text;


namespace AlertaStockMinimo.Models
{
    public class Producto
    {
        public int IdProducto { get; set; }

        public string NombreProducto { get; set; } = string.Empty;

        public int CantidadActual { get; set; }

        public int StockMinimo { get; set; }
    }
}