namespace ProductosApi.Models;

/// <summary>
/// Formato uniforme de error para que cualquier equipo, sin importar
/// su tecnología, sepa qué salió mal al leer el JSON de respuesta.
/// </summary>
public class ApiError
{
    public string Error { get; set; } = string.Empty;
    public List<string> Detalles { get; set; } = new();
}
