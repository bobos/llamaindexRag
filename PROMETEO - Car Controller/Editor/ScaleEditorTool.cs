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
        GUILayout.Label("冻结选中物体下的子mesh缩放", EditorStyles.boldLabel);
        if (GUILayout.Button("Freeze Selected GameObject's Child Mesh Scale"))
        {
            FreezeScale();
        }
    }

    private static void FreezeScale()
    {
        // 获取所有选中的GameObject
        GameObject[] selectedObjects = Selection.gameObjects;
        if (selectedObjects.Length == 0)
        {
            Debug.LogWarning("请先选择至少一个GameObject。");
            return;
        }

        foreach (GameObject go in selectedObjects)
        {
            ProcessGameObject(go);
        }
        Debug.Log("Freeze Child Mesh Scale 完成。");
    }

    private static void ProcessGameObject(GameObject parent)
    {
        // 获取父对象及其所有子对象中带MeshFilter组件的对象
        MeshFilter[] meshFilters = parent.GetComponentsInChildren<MeshFilter>();
        foreach (MeshFilter mf in meshFilters)
        {
            // 记录Undo操作
            Undo.RecordObject(mf, "Freeze Mesh Scale");
            Undo.RecordObject(mf.transform, "Freeze Mesh Scale");

            // 克隆一个新的mesh实例，避免直接修改资源
            Mesh originalMesh = mf.sharedMesh;
            if (originalMesh == null)
                continue;

            Mesh newMesh = Instantiate(originalMesh);
            newMesh.name = originalMesh.name + " (Frozen)";

            // 获取当前物体的localScale
            Vector3 scale = mf.transform.localScale;
            Vector3[] vertices = newMesh.vertices;
            for (int i = 0; i < vertices.Length; i++)
            {
                // 将每个顶点按localScale进行缩放（注意使用Vector3.Scale保证各轴分别缩放）
                vertices[i] = Vector3.Scale(vertices[i], scale);
            }
            newMesh.vertices = vertices;
            newMesh.RecalculateBounds();
            newMesh.RecalculateNormals();

            // 将修改后的mesh赋值给MeshFilter（修改sharedMesh或mesh均可，根据需要选择）
            mf.sharedMesh = newMesh;

            // 重置当前物体的localScale为(1,1,1)
            mf.transform.localScale = Vector3.one;
        }
    }
}
