using ProductosApi.Data;
using ProductosApi.Models;

namespace ProductosApi.Services;

/// <summary>
/// Resultado de una operación de negocio: separa "sí se pudo" de
/// "no se pudo, y aquí está la razón", sin usar excepciones para
/// flujo de control normal.
/// </summary>
public class ResultadoOperacion<T>
{
    public bool Exitoso { get; private set; }
    public T? Valor { get; private set; }
    public string? CodigoError { get; private set; } // "Validacion" | "ProveedorNoExiste"
    public List<string> Errores { get; private set; } = new();

    public static ResultadoOperacion<T> Ok(T valor) => new()
    {
        Exitoso = true,
        Valor = valor
    };

    public static ResultadoOperacion<T> Falla(string codigoError, List<string> errores) => new()
    {
        Exitoso = false,
        CodigoError = codigoError,
        Errores = errores
    };
}

public class ProductoService
{
    private readonly ProductoRepository _repository;

    public ProductoService(ProductoRepository repository)
    {
        _repository = repository;
    }

    public async Task<ResultadoOperacion<ProductoResponse>> AgregarProductoAsync(ProductoRequest request)
    {
        var errores = ValidarDatos(request);
        if (errores.Count > 0)
        {
            return ResultadoOperacion<ProductoResponse>.Falla("Validacion", errores);
        }

        var proveedorExiste = await _repository.ExisteProveedorAsync(request.IdProveedor);
        if (!proveedorExiste)
        {
            return ResultadoOperacion<ProductoResponse>.Falla(
                "ProveedorNoExiste",
                new List<string> { $"No existe un proveedor con id {request.IdProveedor}" });
        }

        var idProducto = await _repository.CrearProductoConStockAsync(request);
        var productoCreado = await _repository.ObtenerPorIdAsync(idProducto);

        return ResultadoOperacion<ProductoResponse>.Ok(productoCreado!);
    }

    public async Task<List<ProductoResponse>> ListarProductosAsync()
    {
        return await _repository.ObtenerTodosAsync();
    }

    /// <summary>
    /// Reglas de negocio simples. Se pueden ampliar sin tocar el
    /// controlador ni el repositorio.
    /// </summary>
    private static List<string> ValidarDatos(ProductoRequest request)
    {
        var errores = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Nombre))
            errores.Add("El nombre del producto es obligatorio.");

        if (request.IdProveedor <= 0)
            errores.Add("Debe indicar un idProveedor válido.");

        if (request.Costo < 0)
            errores.Add("El costo no puede ser negativo.");

        if (request.Precio < 0)
            errores.Add("El precio no puede ser negativo.");

        if (request.Precio > 0 && request.Costo > 0 && request.Precio < request.Costo)
            errores.Add("El precio de venta es menor que el costo.");

        if (request.StockActual < 0)
            errores.Add("El stock actual no puede ser negativo.");

        if (request.StockMinimo < 0 || request.StockMaximo < 0)
            errores.Add("El stock mínimo y máximo no pueden ser negativos.");

        if (request.StockMinimo > request.StockMaximo)
            errores.Add("El stock mínimo no puede ser mayor que el stock máximo.");

        return errores;
    }
}
