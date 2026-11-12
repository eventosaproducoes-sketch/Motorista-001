
import express from "express";

const app = express();
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ORS_API_KEY;
const ORIGIN = "https://eventosaproducoes-sketch.github.io";

app.use((req, res, next) => {
  if (req.headers.origin === ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

async function geocodificar(endereco) {
  const url = new URL(
    "https://api.openrouteservice.org/geocode/search"
  );

  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("text", endereco);
  url.searchParams.set("boundary.country", "BR");
  url.searchParams.set("size", "1");

  const resposta = await fetch(url);
  const dados = await resposta.json();

  if (!resposta.ok || !dados.features?.length) {
    throw new Error("Endereço não encontrado: " + endereco);
  }

  return dados.features[0].geometry.coordinates;
}

async function calcularRota(origem, destino) {
  const resposta = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    {
      method: "POST",
      headers: {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        coordinates: [origem, destino]
      })
    }
  );

  const dados = await resposta.json();

  if (!resposta.ok || !dados.features?.length) {
    throw new Error("Não foi possível calcular a rota.");
  }

  const resumo = dados.features[0].properties.summary;

  return {
    km: Number((resumo.distance / 1000).toFixed(2)),
    segundos: resumo.duration
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    servico: "Transporte Particular"
  });
});

app.post("/api/rotas", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        erro: "Chave de rotas não configurada."
      });
    }

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

    const coordenadasEmbarque = await geocodificar(embarque);
    const coordenadasDestino = await geocodificar(destino);

    const coordenadasMotorista = [
      origemMotorista.longitude,
      origemMotorista.latitude
    ];

    const [busca, viagem] = await Promise.all([
      calcularRota(
        coordenadasMotorista,
        coordenadasEmbarque
      ),
      calcularRota(
        coordenadasEmbarque,
        coordenadasDestino
      )
    ]);

    res.json({
      sucesso: true,
      kmBusca: busca.km,
      kmViagem: viagem.km,
      tempoBusca: busca.segundos,
      tempoViagem: viagem.segundos
    });

  } catch (erro) {
    console.error("Erro nas rotas:", erro.message);

    res.status(502).json({
      erro: "Não foi possível calcular as distâncias. Confira os endereços."
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor iniciado na porta " + PORT);
});
