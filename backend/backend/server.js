
import express from "express";

const app = express();

app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ORS_API_KEY;
const ORIGIN = "https://eventosaproducoes-sketch.github.io";

// CORS
app.use((req, res, next) => {
  if (req.headers.origin === ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Consulta a API e trata respostas inválidas
async function consultarAPI(url, opcoes = {}) {
  const resposta = await fetch(url, opcoes);

  let dados;

  try {
    dados = await resposta.json();
  } catch {
    dados = {};
  }

  if (!resposta.ok) {
    const detalhe =
      dados.error?.message ||
      dados.message ||
      dados.error ||
      "Erro retornado pelo serviço de mapas.";

    console.error(
      "ERRO NA API DE MAPAS:",
      resposta.status,
      detalhe
    );

    throw new Error(
      "API de mapas HTTP " +
      resposta.status +
      ": " +
      detalhe
    );
  }

  return dados;
}

// Converte endereço em coordenadas
async function geocodificar(endereco) {
  const url = new URL(
    "https://api.openrouteservice.org/geocode/search"
  );

  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("text", endereco);
  url.searchParams.set("boundary.country", "BR");
  url.searchParams.set("size", "1");

  const dados = await consultarAPI(url);

  if (!dados.features?.length) {
    throw new Error(
      "Endereço não encontrado: " + endereco
    );
  }

  return dados.features[0].geometry.coordinates;

async function calcularRota(origem, destino) {
  const dados = await consultarAPI(
    "https://api.openrouteservice.org/v2/directions/driving-car/json",
    {
      method: "POST",
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        coordinates: [origem, destino]
      })
    }
  );

  // Aceita JSON e GeoJSON
  const resumo =
    dados.routes?.[0]?.summary ||
    dados.features?.[0]?.properties?.summary;

  if (
    !resumo ||
    !Number.isFinite(Number(resumo.distance)) ||
    !Number.isFinite(Number(resumo.duration))
  ) {
    console.error(
      "RESPOSTA INESPERADA DA ROTA:",
      JSON.stringify(dados).slice(0, 1000)
    );

    throw new Error(
      "A API não retornou distância e duração válidas."
    );
  }

  return {
    km: Number((resumo.distance / 1000).toFixed(2)),
    segundos: Number(resumo.duration)
  };
}

  );

  const resumo = dados.features?.[0]?.properties?.summary;

  if (!resumo) {
    throw new Error(
      "O serviço não retornou os dados da rota."
    );
  }

  return {
    km: Number((resumo.distance / 1000).toFixed(2)),
    segundos: resumo.duration
  };
}

// Teste de funcionamento do servidor
app.get("/", (req, res) => {
  res.json({
    status: "online",
    servico: "Transporte Particular",
    rotas: "disponivel"
  });
});

// Endpoint de cálculo de rotas
app.post("/api/rotas", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        sucesso: false,
        erro: "Chave ORS_API_KEY não configurada no Render."
      });
    }

    const {
      origemMotorista,
      embarque,
      destino
    } = req.body || {};

    if (
      !origemMotorista ||
      !Number.isFinite(origemMotorista.latitude) ||
      !Number.isFinite(origemMotorista.longitude) ||
      origemMotorista.latitude < -90 ||
      origemMotorista.latitude > 90 ||
      origemMotorista.longitude < -180 ||
      origemMotorista.longitude > 180 ||
      typeof embarque !== "string" ||
      typeof destino !== "string" ||
      !embarque.trim() ||
      !destino.trim() ||
      embarque.length > 300 ||
      destino.length > 300
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Confira a localização e os endereços."
      });
    }

    console.log("Iniciando cálculo de rotas.");

    // Geocodificação
    const coordenadasEmbarque =
      await geocodificar(embarque);

    const coordenadasDestino =
      await geocodificar(destino);

    const coordenadasMotorista = [
      origemMotorista.longitude,
      origemMotorista.latitude
    ];

    // Calcula os dois trechos
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

    console.log("Rotas calculadas com sucesso.");

    return res.json({
      sucesso: true,
      kmBusca: busca.km,
      kmViagem: viagem.km,
      tempoBusca: busca.segundos,
      tempoViagem: viagem.segundos
    });

  } catch (erro) {
    console.error(
      "ERRO DETALHADO NAS ROTAS:",
      erro.message
    );

    return res.status(502).json({
      sucesso: false,
      erro: erro.message
    });
  }
});

// Inicialização
app.listen(PORT, () => {
  console.log(
    "Servidor iniciado na porta " + PORT
  );
});
