
import express from "express";
import { GoogleAuth } from "google-auth-library";

const app = express();

app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 8080;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

app.get("/", (req, res) => {
  res.json({
    status: "online",
    servico: "Transporte Particular"
  });
});

app.post("/api/rotas", async (req, res) => {
  try {
    const { origemMotorista, embarque, destino } = req.body;

    if (
      !origemMotorista ||
      !Number.isFinite(origemMotorista.latitude) ||
      !Number.isFinite(origemMotorista.longitude) ||
      typeof embarque !== "string" ||
      typeof destino !== "string" ||
      !embarque.trim() ||
      !destino.trim() ||
      embarque.length > 300 ||
      destino.length > 300
    ) {
      return res.status(400).json({
        erro: "Confira a localização e os endereços."
      });
    }

    const client = await auth.getClient();
    const token = await client.getAccessToken();

    if (!token.token) {
      throw new Error("Falha na autenticação Google.");
    }

    async function calcularRota(origem, destinoRota) {
      const resposta = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token.token}`,
            "X-Goog-FieldMask":
              "routes.distanceMeters,routes.duration"
          },
          body: JSON.stringify({
            origin: origem,
            destination: destinoRota,
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE"
          })
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok || !dados.routes?.length) {
        throw new Error("Falha ao calcular rota.");
      }

      return {
        km: Number(
          (dados.routes[0].distanceMeters / 1000).toFixed(2)
        ),
        duracao: dados.routes[0].duration
      };
    }

    const [busca, viagem] = await Promise.all([
      calcularRota(
        {
          location: {
            latLng: {
              latitude: origemMotorista.latitude,
              longitude: origemMotorista.longitude
            }
          }
        },
        { address: embarque.trim() }
      ),

      calcularRota(
        { address: embarque.trim() },
        { address: destino.trim() }
      )
    ]);

    res.json({
      sucesso: true,
      kmBusca: busca.km,
      kmViagem: viagem.km,
      tempoBusca: busca.duracao,
      tempoViagem: viagem.duracao
    });

  } catch (erro) {
    console.error("Erro nas rotas:", erro.message);

    res.status(502).json({
      erro: "Não foi possível calcular as rotas."
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor iniciado na porta " + PORT);
});
