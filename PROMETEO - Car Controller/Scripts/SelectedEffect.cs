using UnityEngine;

[RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
public class SelectedEffect : MonoBehaviour
{
    public Material outlineMaterial;
    private Material originalMaterial;
    void Start()
    {
        // Make sure we have an outline material assigned
        if (outlineMaterial == null)
        {
            Debug.LogError("OutlineEffect: No outline material assigned!");
            return;
        }

        // Get the MeshFilter from this GameObject
        MeshRenderer originalMeshRenderer = GetComponent<MeshRenderer>();
        originalMaterial = originalMeshRenderer.material;
    }

    public void Select()
    {
        MeshRenderer meshRenderer = GetComponent<MeshRenderer>();
        meshRenderer.material = outlineMaterial;
    }

    public void Deselect()
    {
        MeshRenderer meshRenderer = GetComponent<MeshRenderer>();
        meshRenderer.material = originalMaterial;
    }
}
