import "./style.css";


const form = document.querySelector<HTMLFormElement>(
  "#forgot-password-form"
);

const emailInput = document.querySelector<HTMLInputElement>(
  "#email"
);

const message = document.querySelector<HTMLDivElement>(
  "#message"
);

const submitButton = document.querySelector<HTMLButtonElement>(
  "#submit-button"
);


function showMessage(
  text: string,
  type: "success" | "error"
) {

  if (!message) return;

  message.textContent = text;

  message.classList.remove(
    "hidden",
    "bg-green-50",
    "text-green-700",
    "bg-red-50",
    "text-red-700"
  );


  if (type === "success") {

    message.classList.add(
      "bg-green-50",
      "text-green-700"
    );

  } else {

    message.classList.add(
      "bg-red-50",
      "text-red-700"
    );

  }

}


form?.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    if (!emailInput || !submitButton) {
      return;
    }


    const email =
      emailInput.value.trim();


    if (!email) {

      showMessage(
        "Ingresa tu correo electrónico.",
        "error"
      );

      return;

    }


    submitButton.disabled = true;

    submitButton.textContent =
      "Enviando...";


    try {

      const response = await fetch(
        "http://localhost:3000/api/auth/forgot-password",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            email,
          }),

        }
      );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.message ||
          "Ocurrió un error."
        );

      }


      showMessage(
        data.message,
        "success"
      );


      emailInput.value = "";


    } catch (error) {

      console.error(error);


      showMessage(
        "No fue posible procesar la solicitud.",
        "error"
      );


    } finally {

      submitButton.disabled = false;

      submitButton.textContent =
        "Enviar instrucciones";

    }

  }
);