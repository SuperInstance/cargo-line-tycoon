// JEV cosine similarity — compute pairwise cosine between query and N stored embeddings
// Each embedding is DIM floats

struct Embeddings {
    data: array<f32>,   // packed: N × DIM floats
    count: u32,
    dim: u32,
};

struct Query {
    vector: array<f32>,  // DIM floats
};

struct Scores {
    similarities: array<f32>,  // N floats
};

@group(0) @binding(0) var<storage, read> embeddings: Embeddings;
@group(0) @binding(1) var<storage, read> query: Query;
@group(0) @binding(2) var<storage, read_write> scores: Scores;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= embeddings.count) { return; }
    
    let dim = embeddings.dim;
    var dot: f32 = 0.0;
    var na: f32 = 0.0;
    var nb: f32 = 0.0;
    
    for (var j: u32 = 0u; j < dim; j = j + 1u) {
        let a = embeddings.data[i * dim + j];
        let b = query.vector[j];
        dot = dot + a * b;
        na = na + a * a;
        nb = nb + b * b;
    }
    
    scores.similarities[i] = dot / (sqrt(na) * sqrt(nb) + 1e-12);
}
