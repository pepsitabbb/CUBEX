using System;
using System.Collections.Generic;
using System.Text;

namespace AlertaStockMinimo.Models
{
    public class AlertaStock
    {
        public bool AlertaGenerada { get; set; }

        public int IdProducto { get; set; }

        public string NombreProducto { get; set; } = string.Empty;

        public int CantidadActual { get; set; }

        public string Mensaje { get; set; } = string.Empty;

        public DateTime FechaHora { get; set; }
    }
}
