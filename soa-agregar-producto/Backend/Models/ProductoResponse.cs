namespace ProductosApi.Models;

/// <summary>
/// Lo que la API devuelve después de crear (o consultar) un producto.
/// Incluye tanto los datos de PRODUCTOS como los de STOCK, ya unidos,
/// para que el frontend no tenga que hacer una segunda llamada.
/// </summary>
public class ProductoResponse
{
    public int Id { get; set; }
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
