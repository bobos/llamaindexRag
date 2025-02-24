using UnityEngine;

public class MirrorMesh : MonoBehaviour
{
    public enum MirrorAxis { X, Y, Z }
    public MirrorAxis mirrorAxis = MirrorAxis.X;

    void Start()
    {
        MeshFilter meshFilter = GetComponent<MeshFilter>();
        if (meshFilter != null)
        {
            Mesh originalMesh = meshFilter.mesh;
            Mesh mirroredMesh = Instantiate(originalMesh);

            Vector3[] vertices = originalMesh.vertices;
            Vector3[] normals = originalMesh.normals;

            for (int i = 0; i < vertices.Length; i++)
            {
                switch (mirrorAxis)
                {
                    case MirrorAxis.X:
                        vertices[i].x = -vertices[i].x;
                        normals[i].x = -normals[i].x;
                        break;
                    case MirrorAxis.Y:
                        vertices[i].y = -vertices[i].y;
                        normals[i].y = -normals[i].y;
                        break;
                    case MirrorAxis.Z:
                        vertices[i].z = -vertices[i].z;
                        normals[i].z = -normals[i].z;
                        break;
                }
            }

            mirroredMesh.vertices = vertices;
            mirroredMesh.normals = normals;

            // ·­×ªÈý½ÇÐÎË³Ðò
            for (int subMesh = 0; subMesh < mirroredMesh.subMeshCount; subMesh++)
            {
                int[] triangles = mirroredMesh.GetTriangles(subMesh);
                for (int i = 0; i < triangles.Length; i += 3)
                {
                    int temp = triangles[i];
                    triangles[i] = triangles[i + 1];
                    triangles[i + 1] = temp;
                }
                mirroredMesh.SetTriangles(triangles, subMesh);
            }

            meshFilter.mesh = mirroredMesh;
        }
    }
}
