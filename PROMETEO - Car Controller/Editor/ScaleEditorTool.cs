using UnityEngine;
using UnityEditor;

public class FreezeChildMeshScale : EditorWindow
{
    [MenuItem("Tools/Freeze Child Mesh Scale")]
    public static void ShowWindow()
    {
        GetWindow<FreezeChildMeshScale>("Freeze Mesh Scale");
    }

    private void OnGUI()
    {
        GUILayout.Label("����ѡ�������µ���mesh����", EditorStyles.boldLabel);
        if (GUILayout.Button("Freeze Selected GameObject's Child Mesh Scale"))
        {
            FreezeScale();
        }
    }

    private static void FreezeScale()
    {
        // ��ȡ����ѡ�е�GameObject
        GameObject[] selectedObjects = Selection.gameObjects;
        if (selectedObjects.Length == 0)
        {
            Debug.LogWarning("����ѡ������һ��GameObject��");
            return;
        }

        foreach (GameObject go in selectedObjects)
        {
            ProcessGameObject(go);
        }
        Debug.Log("Freeze Child Mesh Scale ��ɡ�");
    }

    private static void ProcessGameObject(GameObject parent)
    {
        // ��ȡ�������������Ӷ����д�MeshFilter����Ķ���
        MeshFilter[] meshFilters = parent.GetComponentsInChildren<MeshFilter>();
        foreach (MeshFilter mf in meshFilters)
        {
            // ��¼Undo����
            Undo.RecordObject(mf, "Freeze Mesh Scale");
            Undo.RecordObject(mf.transform, "Freeze Mesh Scale");

            // ��¡һ���µ�meshʵ��������ֱ���޸���Դ
            Mesh originalMesh = mf.sharedMesh;
            if (originalMesh == null)
                continue;

            Mesh newMesh = Instantiate(originalMesh);
            newMesh.name = originalMesh.name + " (Frozen)";

            // ��ȡ��ǰ�����localScale
            Vector3 scale = mf.transform.localScale;
            Vector3[] vertices = newMesh.vertices;
            for (int i = 0; i < vertices.Length; i++)
            {
                // ��ÿ�����㰴localScale�������ţ�ע��ʹ��Vector3.Scale��֤����ֱ����ţ�
                vertices[i] = Vector3.Scale(vertices[i], scale);
            }
            newMesh.vertices = vertices;
            newMesh.RecalculateBounds();
            newMesh.RecalculateNormals();

            // ���޸ĺ��mesh��ֵ��MeshFilter���޸�sharedMesh��mesh���ɣ�������Ҫѡ��
            mf.sharedMesh = newMesh;

            // ���õ�ǰ�����localScaleΪ(1,1,1)
            mf.transform.localScale = Vector3.one;
        }
    }
}
