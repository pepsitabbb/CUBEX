namespace ProductosApi.Models;

/// <summary>
/// Datos que el cliente (frontend de cualquier compañero) envía
/// para registrar un producto nuevo junto con su inventario inicial.
/// </summary>
public class ProductoRequest
{
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public string? Lote { get; set; }
    public string? Serie { get; set; }
    public DateTime? Caducidad { get; set; }
    public int IdProveedor { get; set; }
    public decimal Costo { get; set; }
    public decimal Precio { get; set; }

    public int StockActual { get; set; }
    public int StockMinimo { get; set; }
    public int StockMaximo { get; set; }
}
