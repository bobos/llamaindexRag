Shader "Custom/Outline"
{
    Properties
    {
        _OutlineColor ("Outline Color", Color) = (1,0,0,1)
        _OutlineThickness ("Outline Thickness", Float) = 0.05
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        // We disable ZWrite if you want the outline always visible behind the object.
        ZWrite On 
        // Cull front so we only see the back faces (the outline shell)
        Cull Front

        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
            };

            fixed4 _OutlineColor;
            float _OutlineThickness;

            v2f vert(appdata v)
            {
                v2f o;
                // Offset the vertex position along the normal
                float3 offset = v.normal * _OutlineThickness;
                o.pos = UnityObjectToClipPos(v.vertex + float4(offset, 0));
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                // Output the solid outline color
                return _OutlineColor;
            }
            ENDHLSL
        }
    }
    FallBack "Diffuse"
}
