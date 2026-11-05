using ProductosApi.Data;
using ProductosApi.Services;

var builder = WebApplication.CreateBuilder(args);

// --- Servicios de la aplicación ---
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddScoped<ProductoRepository>();
builder.Services.AddScoped<ProductoService>();

// CORS abierto: el frontend de prueba (y los de los compañeros)
// pueden correr en otro puerto/origen distinto al de esta API.
builder.Services.AddCors(options =>
{
    options.AddPolicy("PermitirTodo", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Swagger disponible siempre (útil para que el equipo vea el
// contrato de la API sin tener que leer el código C#).
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("PermitirTodo");
app.UseAuthorization();
app.MapControllers();

app.Run();
